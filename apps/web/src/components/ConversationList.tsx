"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { ConversationListItem } from "@/lib/types";
import { formatTime, messageBodyOf, statusLabel } from "@/lib/format";

const POLL_MS = 5000;

export default function ConversationList() {
  const params = useSearchParams();
  const route = useParams();
  const scope = params.get("scope") ?? "all";
  const search = params.get("search") ?? "";
  const selectedId = (route?.id as string | undefined) ?? null;

  const [items, setItems] = useState<ConversationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const qs = new URLSearchParams({ scope, ...(search ? { search } : {}) });
        const data = await api<{ items: ConversationListItem[] }>(
          `/api/conversations?${qs.toString()}`,
        );
        if (alive) {
          setItems(data.items);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) timer = setTimeout(load, POLL_MS);
      }
    }
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [scope, search]);

  if (items === null) {
    return (
      <div className="p-4 text-sm text-slate-400">Cargando conversaciones...</div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-red-600">{error}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        No hay conversaciones en este filtro.
      </div>
    );
  }

  return (
    <div className="overflow-y-auto scrollbar-thin">
      {items.map((c) => {
        const last = c.messages[0];
        const lastBody = last ? messageBodyOf(last.content) : "";
        const isOutbound = last?.direction === "outbound";
        const status = statusLabel(c.status);
        const active = selectedId === c.id;
        return (
          <Link
            key={c.id}
            href={`/inbox/${c.id}${params.toString() ? "?" + params.toString() : ""}`}
            className={clsx(
              "block px-4 py-3 border-b border-slate-100 transition",
              active ? "bg-brand-50" : "hover:bg-slate-50",
            )}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <div className="font-medium text-sm text-slate-900 truncate">
                {c.contact.profileName ?? c.contact.name ?? c.contact.phoneNumber}
              </div>
              <div className="text-[10px] text-slate-400 shrink-0">
                {formatTime(c.updatedAt)}
              </div>
            </div>
            <div className="text-xs text-slate-500 truncate mb-1">
              {isOutbound && <span className="text-slate-400">→ </span>}
              {lastBody || <em className="text-slate-300">sin mensajes</em>}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span
                className={clsx(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                  status.className,
                )}
              >
                {status.label}
              </span>
              {c.contact.tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600"
                >
                  {t}
                </span>
              ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
