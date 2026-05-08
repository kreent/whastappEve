export function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

export function statusLabel(status: string): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Abierta", className: "bg-blue-100 text-blue-800" },
    assigned: { label: "Asignada", className: "bg-emerald-100 text-emerald-800" },
    pending: { label: "Pendiente", className: "bg-amber-100 text-amber-800" },
    resolved: { label: "Resuelta", className: "bg-slate-200 text-slate-700" },
    bot_handling: { label: "Bot", className: "bg-violet-100 text-violet-800" },
  };
  return map[status] ?? { label: status, className: "bg-slate-200 text-slate-700" };
}

export function messageBodyOf(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const c = content as Record<string, unknown>;
  if (typeof c.body === "string") return c.body;
  if (c.text && typeof c.text === "object") {
    const t = (c.text as Record<string, unknown>).body;
    if (typeof t === "string") return t;
  }
  if (c.interactive && typeof c.interactive === "object") {
    const i = c.interactive as Record<string, unknown>;
    const br = i.button_reply as { title?: string } | undefined;
    if (br?.title) return br.title;
    const lr = i.list_reply as { title?: string } | undefined;
    if (lr?.title) return lr.title;
  }
  return "";
}
