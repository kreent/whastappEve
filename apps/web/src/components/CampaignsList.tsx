"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import NewCampaignModal from "./NewCampaignModal";

interface Campaign {
  id: string;
  name: string;
  status: string;
  totalRecipients: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  template: { name: string; status: string };
  _count: { recipients: number };
}

const STATUS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  queued: "bg-blue-100 text-blue-800",
  sending: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-600",
  failed: "bg-red-100 text-red-800",
};

export default function CampaignsList({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Campaign[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await api<Campaign[]>("/api/campaigns");
        if (alive) setItems(data);
      } catch {
        if (alive) setItems([]);
      }
    }
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [reloadKey]);

  if (items === null) return <div className="text-sm text-slate-400">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-slate-200">
          <div className="text-sm text-slate-500">{items.length} campañas</div>
          {isAdmin && (
            <button
              onClick={() => setShowNew(true)}
              className="text-xs bg-brand-600 hover:bg-brand-700 text-white font-medium px-3 py-1.5 rounded"
            >
              + Nueva campaña
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Plantilla</th>
              <th className="px-4 py-2 font-medium">Destinatarios</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Creada</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-slate-400 text-center">
                  Sin campañas. Crea una para empezar.
                </td>
              </tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{c.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                  {c.template.name}
                </td>
                <td className="px-4 py-2.5 text-slate-700">{c.totalRecipients}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={clsx(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      STATUS[c.status] ?? "bg-slate-100 text-slate-700",
                    )}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">
                  {formatRelative(c.createdAt)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/broadcasts/${c.id}`}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewCampaignModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
