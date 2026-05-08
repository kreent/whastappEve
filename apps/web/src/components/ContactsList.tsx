"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Contact } from "@/lib/types";
import { formatRelative } from "@/lib/format";

export default function ContactsList() {
  const [items, setItems] = useState<Contact[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      try {
        const data = await api<{ items: Contact[] }>(`/api/contacts?${qs.toString()}`);
        if (alive) setItems(data.items);
      } catch {
        if (alive) setItems([]);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [search]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-slate-200">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por número, nombre o profile name..."
          className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded"
        />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
            <th className="px-4 py-2 font-medium">Contacto</th>
            <th className="px-4 py-2 font-medium">Tags</th>
            <th className="px-4 py-2 font-medium">Último mensaje</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items === null && (
            <tr>
              <td colSpan={4} className="p-4 text-slate-400 text-center">
                Cargando...
              </td>
            </tr>
          )}
          {items?.length === 0 && (
            <tr>
              <td colSpan={4} className="p-4 text-slate-400 text-center">
                Sin contactos.
              </td>
            </tr>
          )}
          {items?.map((c) => (
            <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-2.5">
                <div className="font-medium text-slate-900">
                  {c.profileName ?? c.name ?? "Sin nombre"}
                </div>
                <div className="text-xs text-slate-500">{c.phoneNumber}</div>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex gap-1 flex-wrap">
                  {c.tags.length === 0 && <span className="text-xs text-slate-400">—</span>}
                  {c.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-2.5 text-slate-500 text-xs">
                {formatRelative(c.lastMessageAt)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Link
                  href={`/inbox?search=${encodeURIComponent(c.phoneNumber)}`}
                  className="text-xs text-brand-700 hover:underline"
                >
                  Ver conversaciones →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
