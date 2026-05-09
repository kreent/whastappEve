"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import { formatCurrency, formatDate, daysUntil } from "@/lib/money";

interface Installment {
  id: string;
  number: number;
  amount: string;
  dueDate: string;
  status: string;
  reminderSentAt: string | null;
  paidAt: string | null;
  errorMessage: string | null;
  paymentLink: string | null;
  debt: {
    id: string;
    description: string | null;
    installmentCount: number;
    paymentLink: string | null;
    currency: string;
    contact: {
      id: string;
      phoneNumber: string;
      profileName: string | null;
      name: string | null;
    };
    template: { name: string; status: string } | null;
  };
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  scheduled: "bg-blue-100 text-blue-800",
  sent: "bg-emerald-100 text-emerald-800",
  paid: "bg-emerald-200 text-emerald-900",
  overdue: "bg-red-100 text-red-800",
  failed: "bg-red-100 text-red-800",
};

export default function DebtsDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [scope, setScope] = useState<"today" | "overdue" | "upcoming">("today");
  const [items, setItems] = useState<Installment[] | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await api<Installment[]>(`/api/installments?scope=${scope}`);
        if (alive) setItems(data);
      } catch {
        if (alive) setItems([]);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [scope, reloadKey]);

  async function markPaid(id: string) {
    try {
      await api(`/api/installments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "paid" }),
      });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function sendNow(id: string) {
    try {
      await api(`/api/installments/${id}/send-now`, { method: "POST" });
      setInfo("Recordatorio encolado. Se envía en segundos.");
      setTimeout(() => setReloadKey((k) => k + 1), 2000);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(msg);
    }
  }

  async function editLink(id: string, currentLink: string | null) {
    const next = window.prompt(
      "Link de pago para esta cuota (deja vacío para borrar):",
      currentLink ?? "",
    );
    if (next === null) return;
    try {
      await api(`/api/installments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ paymentLink: next.trim() || null }),
      });
      setInfo("Link de pago actualizado.");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runRemindersNow() {
    try {
      await api("/api/debts/run-reminders", { method: "POST" });
      setInfo("Tick manual encolado. Procesando todas las cuotas que vencen hoy.");
      setTimeout(() => setReloadKey((k) => k + 1), 3000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {(["today", "upcoming", "overdue"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`text-xs px-3 py-1.5 rounded border ${
              scope === s
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {s === "today" ? "Hoy" : s === "upcoming" ? "Próximas (14d)" : "Vencidas"}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={runRemindersNow}
            className="text-xs px-3 py-1.5 rounded border border-brand-500 bg-brand-50 text-brand-800 hover:bg-brand-100 ml-auto"
          >
            Disparar tick ahora
          </button>
        )}
      </div>

      {info && (
        <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2">
          {info}
        </div>
      )}
      {error && (
        <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Cuota</th>
              <th className="px-4 py-2 font-medium">Monto</th>
              <th className="px-4 py-2 font-medium">Vence</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items === null && (
              <tr>
                <td colSpan={6} className="p-4 text-slate-400 text-center">Cargando...</td>
              </tr>
            )}
            {items?.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-slate-400 text-center">
                  No hay cuotas en este filtro.
                </td>
              </tr>
            )}
            {items?.map((i) => {
              const d = daysUntil(i.dueDate);
              const dLabel = d === 0 ? "hoy" : d > 0 ? `en ${d}d` : `${Math.abs(d)}d atrás`;
              return (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">
                      {i.debt.contact.profileName ?? i.debt.contact.name ?? i.debt.contact.phoneNumber}
                    </div>
                    <div className="text-xs text-slate-500">{i.debt.contact.phoneNumber}</div>
                    {i.debt.description && (
                      <div className="text-[11px] text-slate-400">{i.debt.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {i.number} <span className="text-slate-400">de {i.debt.installmentCount}</span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {formatCurrency(i.amount, i.debt.currency)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-slate-700">{formatDate(i.dueDate)}</div>
                    <div className="text-xs text-slate-400">{dLabel}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={clsx(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium",
                        STATUS_STYLE[i.status] ?? "bg-slate-100 text-slate-700",
                      )}
                    >
                      {i.status}
                    </span>
                    {i.errorMessage && (
                      <div className="text-[10px] text-red-600 mt-1 max-w-[160px] truncate">
                        {i.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-2">
                    {i.status !== "paid" && (
                      <>
                        {isAdmin && (
                          <button
                            onClick={() => editLink(i.id, i.paymentLink)}
                            className="text-[11px] text-slate-600 hover:underline"
                            title={i.paymentLink ?? "Sin link"}
                          >
                            {i.paymentLink ? "🔗 Editar link" : "+ Link"}
                          </button>
                        )}
                        {isAdmin && i.debt.template?.status === "approved" && (
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
    </div>
  );
}
