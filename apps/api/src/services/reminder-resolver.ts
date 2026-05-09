// Resolves WhatsApp template parameters for a debt installment reminder.
// Supports the same parameterMapping format used by campaigns, plus
// installment-/debt-specific fields.

import type { Contact, Debt, Installment } from "@prisma/client";

export type ReminderParameterMapping =
  | { index: number; kind: "static"; value: string }
  | {
      index: number;
      kind: "context_field";
      field:
        | "contact.name"
        | "contact.profileName"
        | "contact.phoneNumber"
        | "installment.number"
        | "installment.numberOfTotal" // "2 de 4"
        | "installment.amount"
        | "installment.amountFormatted"
        | "installment.dueDate"
        | "debt.installmentCount"
        | "debt.description"
        | "debt.paymentLink"
        | "installment.paymentLink"
        | "paymentLink"; // installment.paymentLink || debt.paymentLink
    };

export const AVAILABLE_FIELDS: Array<{ value: string; label: string }> = [
  { value: "contact.profileName", label: "Nombre del cliente (perfil WhatsApp)" },
  { value: "contact.name", label: "Nombre del cliente (DB)" },
  { value: "installment.numberOfTotal", label: "Número de cuota (ej: '2 de 4')" },
  { value: "installment.number", label: "Número de cuota (solo el número)" },
  { value: "installment.amountFormatted", label: "Valor de la cuota (formato $123.456)" },
  { value: "installment.amount", label: "Valor de la cuota (sin formato)" },
  { value: "installment.dueDate", label: "Fecha de vencimiento" },
  { value: "debt.installmentCount", label: "Total de cuotas" },
  { value: "debt.description", label: "Descripción de la deuda" },
  { value: "paymentLink", label: "Link de pago (cuota o deuda)" },
];

export interface ReminderContext {
  contact: Contact;
  debt: Debt;
  installment: Installment;
}

export function resolveReminderParams(
  mapping: ReminderParameterMapping[],
  ctx: ReminderContext,
): string[] {
  const sorted = [...mapping].sort((a, b) => a.index - b.index);
  return sorted.map((m) => (m.kind === "static" ? m.value : resolveField(m.field, ctx)));
}

function resolveField(field: string, ctx: ReminderContext): string {
  switch (field) {
    case "contact.name":
      return ctx.contact.name ?? "";
    case "contact.profileName":
      return ctx.contact.profileName ?? ctx.contact.name ?? "";
    case "contact.phoneNumber":
      return ctx.contact.phoneNumber;
    case "installment.number":
      return String(ctx.installment.number);
    case "installment.numberOfTotal":
      return `${ctx.installment.number} de ${ctx.debt.installmentCount}`;
    case "installment.amount":
      return ctx.installment.amount.toString();
    case "installment.amountFormatted":
      return formatCurrency(Number(ctx.installment.amount), ctx.debt.currency);
    case "installment.dueDate":
      return ctx.installment.dueDate.toISOString().slice(0, 10);
    case "debt.installmentCount":
      return String(ctx.debt.installmentCount);
    case "debt.description":
      return ctx.debt.description ?? "";
    case "debt.paymentLink":
      return ctx.debt.paymentLink ?? "";
    case "installment.paymentLink":
      return ctx.installment.paymentLink ?? "";
    case "paymentLink":
      return ctx.installment.paymentLink ?? ctx.debt.paymentLink ?? "";
    default:
      return "";
  }
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value.toFixed(0)}`;
  }
}
