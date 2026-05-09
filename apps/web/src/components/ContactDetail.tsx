"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import { formatCurrency, formatDate, daysUntil } from "@/lib/money";
import NewDebtModal from "./NewDebtModal";

interface Contact {
  id: string;
  phoneNumber: string;
  profileName: string | null;
  name: string | null;
  tags: string[];
  optedOut: boolean;
  createdAt: string;
  conversations: Array<{ id: string; status: string; updatedAt: string }>;
}

interface Installment {
  id: string;
  number: number;
  amount: string;
  dueDate: string;
  status: string;
  paidAt: string | null;
}

interface Debt {
  id: string;
  description: string | null;
  totalAmount: string;
  currency: string;
  installmentCount: number;
  paymentDayOfMonth: number;
  firstDueDate: string;
  paymentLink: string | null;
  status: string;
  template: { id: string; name: string; status: string } | null;
  installments: Installment[];
}

const INSTALLMENT_STATUS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  scheduled: "bg-blue-100 text-blue-800",
  sent: "bg-emerald-100 text-emerald-800",
  paid: "bg-emerald-200 text-emerald-900",
  overdue: "bg-red-100 text-red-800",
  failed: "bg-red-100 text-red-800",
};

export default function ContactDetail({
  contactId,
  isAdmin,
}: {
  contactId: string;
  isAdmin: boolean;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [showNewDebt, setShowNewDebt] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<Contact>(`/api/contacts/${contactId}`),
      api<Debt[]>(`/api/debts?contactId=${contactId}`),
    ])
      .then(([c, d]) => {
        if (alive) {
          setContact(c);
          setDebts(d);
        }
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [contactId, reloadKey]);

  async function markPaid(installmentId: string) {
    try {
      await api(`/api/installments/${installmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "paid" }),
      });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cancelDebt(debtId: string) {
    if (!confirm("¿Cancelar el crédito? Las cuotas pendientes ya no se cobrarán.")) return;
    try {
      await api(`/api/debts/${debtId}`, { method: "DELETE" });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function sendNow(installmentId: string) {
    try {
      await api(`/api/installments/${installmentId}/send-now`, { method: "POST" });
      setTimeout(() => setReloadKey((k) => k + 1), 2000);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(msg);
    }
  }

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!contact) return <div className="text-sm text-slate-400">Cargando...</div>;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/contacts" className="text-xs text-slate-500 hover:text-slate-900">
          ← Contactos
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {contact.profileName ?? contact.name ?? "Sin nombre"}
            </h1>
            <div className="text-sm text-slate-500">{contact.phoneNumber}</div>
          </div>
          {contact.optedOut && (
            <span className="text-[11px] bg-red-100 text-red-700 px-2 py-0.5 rounded">
              opt-out
            </span>
          )}
        </div>
        {contact.tags.length > 0 && (
          <div className="mt-2 flex gap-1 flex-wrap">
            {contact.tags.map((t) => (
              <span key={t} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Créditos ({debts?.filter((d) => d.status === "active").length ?? 0} activos)
          </h2>
          {isAdmin && (
            <button
              onClick={() => setShowNewDebt(true)}
              className="text-xs bg-brand-600 hover:bg-brand-700 text-white font-medium px-3 py-1.5 rounded"
            >
              + Asignar crédito
            </button>
          )}
        </div>

        {debts === null && <div className="text-sm text-slate-400">Cargando...</div>}
        {debts?.length === 0 && (
          <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded p-4">
            Este contacto no tiene créditos asignados todavía.
          </div>
        )}

        <div className="space-y-3">
          {debts?.map((d) => (
            <div key={d.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-900">
                    {d.description ?? "Crédito"} ·{" "}
                    <span className="text-slate-500 font-normal">
                      {formatCurrency(d.totalAmount, d.currency)} en {d.installmentCount} cuotas
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Vence día {d.paymentDayOfMonth} cada mes · Plantilla:{" "}
                    <code>{d.template?.name ?? "(ninguna)"}</code>
                    {d.template && d.template.status !== "approved" && (
                      <span className="ml-1 text-amber-700">
                        ({d.template.status})
                      </span>
                    )}
                    {d.paymentLink && (
                      <span className="ml-1">
                        ·{" "}
                        <a
                          href={d.paymentLink}
                          target="_blank"
                          className="text-brand-700 underline"
                        >
                          link de pago
                        </a>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      d.status === "active"
                        ? "bg-blue-100 text-blue-800"
                        : d.status === "paid"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {d.status}
                  </span>
                  {isAdmin && d.status === "active" && (
                    <button
                      onClick={() => cancelDebt(d.id)}
                      className="text-[11px] text-red-600 hover:underline"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[11px] text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-1.5 font-medium">Cuota</th>
                    <th className="px-4 py-1.5 font-medium">Monto</th>
                    <th className="px-4 py-1.5 font-medium">Vence</th>
                    <th className="px-4 py-1.5 font-medium">Estado</th>
                    <th className="px-4 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {d.installments.map((i) => {
                    const days = daysUntil(i.dueDate);
                    return (
                      <tr key={i.id} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-700">{i.number}</td>
                        <td className="px-4 py-2 text-slate-900">
                          {formatCurrency(i.amount, d.currency)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-slate-700">{formatDate(i.dueDate)}</div>
                          {i.status !== "paid" && (
                            <div className="text-[11px] text-slate-400">
                              {days === 0 ? "hoy" : days > 0 ? `en ${days}d` : `${Math.abs(days)}d atrás`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={clsx(
                              "text-[10px] px-2 py-0.5 rounded-full font-medium",
                              INSTALLMENT_STATUS[i.status] ?? "bg-slate-100 text-slate-700",
                            )}
                          >
                            {i.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right space-x-2">
                          {i.status !== "paid" && (
                            <>
                              {isAdmin && d.template?.status === "approved" && (
                                <button
                                  onClick={() => sendNow(i.id)}
                                  className="text-[11px] text-brand-700 hover:underline"
                                >
                                  Enviar
                                </button>
                              )}
                              <button
                                onClick={() => markPaid(i.id)}
                                className="text-[11px] text-emerald-700 hover:underline"
                              >
                                Marcar pagada
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Conversaciones</h2>
        {contact.conversations.length === 0 ? (
          <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded p-4">
            Sin conversaciones todavía.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {contact.conversations.map((c) => (
              <Link
                key={c.id}
                href={`/inbox/${c.id}`}
                className="block px-4 py-2.5 hover:bg-slate-50 text-sm flex items-center justify-between"
              >
                <span className="text-slate-700">{c.status}</span>
                <span className="text-xs text-slate-400">{formatDate(c.updatedAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNewDebt && (
        <NewDebtModal
          contactId={contactId}
          onClose={() => setShowNewDebt(false)}
          onCreated={() => {
            setShowNewDebt(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
