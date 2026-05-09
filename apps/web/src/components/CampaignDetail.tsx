"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";

interface Recipient {
  id: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  contact: { id: string; phoneNumber: string; profileName: string | null; name: string | null };
}

interface CampaignSummary {
  campaign: {
    id: string;
    name: string;
    status: string;
    totalRecipients: number;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    template: { name: string; language: string };
    createdBy?: { name: string } | null;
  };
  counts: Record<string, number>;
  recipients: Recipient[];
}

const RCPT_STATUS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  queued: "bg-blue-100 text-blue-800",
  sent: "bg-sky-100 text-sky-800",
  delivered: "bg-cyan-100 text-cyan-800",
  read: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  skipped_opted_out: "bg-amber-100 text-amber-800",
};

export default function CampaignDetail({
  campaignId,
  isAdmin,
}: {
  campaignId: string;
  isAdmin: boolean;
}) {
  const [data, setData] = useState<CampaignSummary | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const d = await api<CampaignSummary>(`/api/campaigns/${campaignId}`);
        if (alive) setData(d);
      } catch {}
    }
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [campaignId]);

  async function cancel() {
    if (!confirm("¿Cancelar la campaña?")) return;
    await api(`/api/campaigns/${campaignId}/cancel`, { method: "POST" });
  }

  if (!data) return <div className="text-sm text-slate-400">Cargando...</div>;

  const { campaign, counts, recipients } = data;
  const total = campaign.totalRecipients;
  const sent = (counts.sent ?? 0) + (counts.delivered ?? 0) + (counts.read ?? 0);
  const delivered = (counts.delivered ?? 0) + (counts.read ?? 0);
  const failed = counts.failed ?? 0;
  const optedOut = counts.skipped_opted_out ?? 0;
  const inFlight = (counts.queued ?? 0) + (counts.pending ?? 0);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/broadcasts" className="text-xs text-slate-500 hover:text-slate-900">
          ← Volver a campañas
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-2">{campaign.name}</h1>
        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
          <span>plantilla: <code>{campaign.template.name}</code></span>
          <span>·</span>
          <span>idioma: {campaign.template.language}</span>
          <span>·</span>
          <span>creada {formatRelative(campaign.createdAt)}</span>
          {campaign.createdBy && (
            <>
              <span>·</span>
              <span>por {campaign.createdBy.name}</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Destinatarios" value={total.toString()} />
        <KPI label="Enviados" value={sent.toString()} sub={`${total > 0 ? Math.round((sent / total) * 100) : 0}%`} />
        <KPI label="Entregados" value={delivered.toString()} />
        <KPI label="Fallidos / opt-out" value={`${failed} / ${optedOut}`} />
      </div>

      <div className="bg-white border border-slate-200 rounded p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-slate-700">Estado: {campaign.status}</div>
          {isAdmin && campaign.status !== "completed" && campaign.status !== "cancelled" && (
            <button
              onClick={cancel}
              className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2 py-1 rounded"
            >
              Cancelar
            </button>
          )}
        </div>
        <div className="bg-slate-100 rounded h-2 overflow-hidden">
          <div
            className="bg-brand-500 h-full transition-all"
            style={{ width: `${total > 0 ? ((sent + failed + optedOut) / total) * 100 : 0}%` }}
          />
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {inFlight} pendientes / {sent + failed + optedOut} procesados de {total}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Enviado</th>
              <th className="px-4 py-2 font-medium">Entregado</th>
              <th className="px-4 py-2 font-medium">Leído</th>
              <th className="px-4 py-2 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {recipients.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400 text-xs">
                  Aún no hay destinatarios asignados.
                </td>
              </tr>
            )}
            {recipients.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <div className="text-slate-900">
                    {r.contact.profileName ?? r.contact.name ?? r.contact.phoneNumber}
                  </div>
                  <div className="text-xs text-slate-500">{r.contact.phoneNumber}</div>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={clsx(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      RCPT_STATUS[r.status] ?? "bg-slate-100 text-slate-700",
                    )}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {r.sentAt ? formatRelative(r.sentAt) : "—"}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {r.deliveredAt ? formatRelative(r.deliveredAt) : "—"}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {r.readAt ? formatRelative(r.readAt) : "—"}
                </td>
                <td className="px-4 py-2 text-xs text-red-600 max-w-[180px] truncate">
                  {r.errorMessage ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
