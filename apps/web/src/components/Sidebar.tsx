"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

interface Props {
  user: User;
}

const FILTERS: Array<{ id: string; label: string; scope: string }> = [
  { id: "all", label: "Todas", scope: "all" },
  { id: "mine", label: "Asignadas a mí", scope: "mine" },
  { id: "unassigned", label: "Sin asignar", scope: "unassigned" },
  { id: "pending", label: "Pendientes", scope: "pending" },
  { id: "bot", label: "Con el bot", scope: "bot" },
  { id: "resolved", label: "Resueltas", scope: "resolved" },
];

export default function Sidebar({ user }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const currentScope = params.get("scope") ?? "all";

  async function handleLogout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.replace("/login");
  }

  return (
    <aside className="w-60 bg-slate-900 text-slate-200 flex flex-col">
      <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-2">
        <div className="w-8 h-8 rounded-md bg-brand-500 flex items-center justify-center text-white font-bold">
          W
        </div>
        <div>
          <div className="font-semibold text-sm text-white">WhatsApp Platform</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            {user.role}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 text-sm">
        <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-slate-500">
          Bandeja
        </div>
        {FILTERS.map((f) => {
          const active = currentScope === f.scope;
          return (
            <Link
              key={f.id}
              href={`/inbox?scope=${f.scope}`}
              className={clsx(
                "block px-3 py-1.5 rounded-md transition",
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800/60",
              )}
            >
              {f.label}
            </Link>
          );
        })}

        <div className="pt-4 px-2 py-1.5 text-[11px] uppercase tracking-wider text-slate-500">
          Más
        </div>
        <Link
          href="/contacts"
          className="block px-3 py-1.5 rounded-md text-slate-300 hover:bg-slate-800/60"
        >
          Contactos
        </Link>
        <Link
          href="/flows"
          className="block px-3 py-1.5 rounded-md text-slate-300 hover:bg-slate-800/60"
        >
          Flujos
        </Link>
        <Link
          href="/templates"
          className="block px-3 py-1.5 rounded-md text-slate-300 hover:bg-slate-800/60"
        >
          Plantillas
        </Link>
        <Link
          href="/metrics"
          className="block px-3 py-1.5 rounded-md text-slate-300 hover:bg-slate-800/60"
        >
          Métricas
        </Link>
      </nav>

      <div className="p-3 border-t border-slate-800">
        <div className="px-2 py-1 text-xs">
          <div className="text-white truncate">{user.name}</div>
          <div className="text-slate-500 truncate">{user.email}</div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full mt-2 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded py-1.5 px-2 transition"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
