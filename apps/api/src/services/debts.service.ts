import type { Debt, Installment, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export interface CreateDebtInput {
  contactId: string;
  description?: string;
  totalAmount: number;
  currency?: string;
  installmentCount: number;
  paymentDayOfMonth: number;
  firstDueDate: Date;
  paymentLink?: string;
  templateId?: string;
  parameterMapping?: object;
}

/**
 * Splits totalAmount into installmentCount equal installments.
 * Rounds to 2 decimals; the last installment absorbs the rounding remainder
 * so the sum always equals totalAmount.
 */
export function splitAmount(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  const list: number[] = [];
  for (let i = 0; i < count; i++) {
    const c = i === count - 1 ? base + remainder : base;
    list.push(c / 100);
  }
  return list;
}

/** Returns the date of `dayOfMonth` `monthsFromBase` months after `base`. */
export function addMonthsKeepingDay(base: Date, monthsFromBase: number, dayOfMonth: number): Date {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + monthsFromBase;
  // last day of target month
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const d = Math.min(dayOfMonth, lastDay);
  return new Date(Date.UTC(year, month, d));
}

export async function createDebtWithInstallments(input: CreateDebtInput): Promise<Debt & { installments: Installment[] }> {
  const amounts = splitAmount(input.totalAmount, input.installmentCount);
  const dueDates: Date[] = [];
  for (let i = 0; i < input.installmentCount; i++) {
    if (i === 0) {
      dueDates.push(input.firstDueDate);
    } else {
      dueDates.push(addMonthsKeepingDay(input.firstDueDate, i, input.paymentDayOfMonth));
    }
  }

  return prisma.$transaction(async (tx) => {
    const debt = await tx.debt.create({
      data: {
        contactId: input.contactId,
        description: input.description,
        totalAmount: input.totalAmount,
        currency: input.currency ?? "COP",
        installmentCount: input.installmentCount,
        paymentDayOfMonth: input.paymentDayOfMonth,
        firstDueDate: input.firstDueDate,
        paymentLink: input.paymentLink ?? null,
        templateId: input.templateId ?? null,
        parameterMapping: (input.parameterMapping ?? []) as Prisma.InputJsonValue,
        status: "active",
      },
    });
    await tx.installment.createMany({
      data: amounts.map((amount, idx) => ({
        debtId: debt.id,
        number: idx + 1,
        amount,
        dueDate: dueDates[idx],
        status: "pending" as const,
      })),
    });
    const installments = await tx.installment.findMany({
      where: { debtId: debt.id },
      orderBy: { number: "asc" },
    });
    return { ...debt, installments };
  });
}

export async function markInstallmentPaid(installmentId: string): Promise<Installment> {
  const installment = await prisma.installment.update({
    where: { id: installmentId },
    data: { status: "paid", paidAt: new Date() },
    include: { debt: { include: { installments: true } } },
  });
  // If all installments paid, mark debt as paid.
  const allPaid = installment.debt.installments.every(
    (i) => (i.id === installment.id ? true : i.status === "paid"),
  );
  if (allPaid) {
    await prisma.debt.update({
      where: { id: installment.debtId },
      data: { status: "paid" },
    });
  }
  return installment;
}

export interface ListInstallmentsFilter {
  scope?: "today" | "overdue" | "upcoming" | "pending" | "all";
  contactId?: string;
}

export async function listInstallments(filter: ListInstallmentsFilter = {}) {
  const today = todayUtcDate();
  let where: Prisma.InstallmentWhereInput = {};
  if (filter.contactId) {
    where.debt = { contactId: filter.contactId };
  }
  if (filter.scope === "today") {
    where = { ...where, status: { in: ["pending", "scheduled"] }, dueDate: today };
  } else if (filter.scope === "overdue") {
    where = { ...where, status: { in: ["pending", "scheduled", "sent", "overdue"] }, dueDate: { lt: today } };
  } else if (filter.scope === "upcoming") {
    const in14 = new Date(today);
    in14.setUTCDate(in14.getUTCDate() + 14);
    where = { ...where, status: { in: ["pending", "scheduled"] }, dueDate: { gte: today, lte: in14 } };
  } else if (filter.scope === "pending") {
    // todas las cuotas no pagadas/canceladas, sin importar la fecha
    where = { ...where, status: { in: ["pending", "scheduled", "sent", "overdue", "failed"] } };
  }
  return prisma.installment.findMany({
    where,
    include: {
      debt: { include: { contact: true, template: true } },
    },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    take: 500,
  });
}

export function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
