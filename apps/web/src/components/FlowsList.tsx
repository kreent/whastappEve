"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerValue: string | null;
  priority: number;
  isActive: boolean;
}

export default function FlowsList() {
  const [items, setItems] = useState<FlowRow[] | null>(null);

  useEffect(() => {
    api<FlowRow[]>("/api/flows").then(setItems).catch(() => setItems([]));
  }, []);

  if (items === null) return <div className="text-sm text-slate-400">Cargando...</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <div className="text-sm text-slate-500">{items.length} flujos</div>
        <Link
          href="/flows/new"
          className="text-xs bg-brand-600 hover:bg-brand-700 text-white font-medium px-3 py-1.5 rounded"
        >
          + Nuevo flujo
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
            <th className="px-4 py-2 font-medium">Nombre</th>
            <th className="px-4 py-2 font-medium">Trigger</th>
            <th className="px-4 py-2 font-medium">Prioridad</th>
            <th className="px-4 py-2 font-medium">Activo</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="p-4 text-slate-400 text-center">
                Sin flujos. Crea uno nuevo.
              </td>
            </tr>
          )}
          {items.map((f) => (
            <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-2.5">
                <div className="font-medium text-slate-900">{f.name}</div>
                <div className="text-xs text-slate-500">{f.description}</div>
              </td>
              <td className="px-4 py-2.5">
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {f.triggerType}
                </span>
                {f.triggerValue && (
                  <span className="ml-2 text-xs text-slate-500">"{f.triggerValue}"</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-slate-700">{f.priority}</td>
              <td className="px-4 py-2.5">
                <span
                  className={
                    f.isActive
                      ? "text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded"
                      : "text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded"
                  }
                >
                  {f.isActive ? "Sí" : "No"}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <Link
                  href={`/flows/${f.id}/edit`}
                  className="text-xs text-brand-700 hover:underline"
                >
                  Editar →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
