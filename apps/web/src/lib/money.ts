export function formatCurrency(value: number | string, currency = "COP"): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${n.toFixed(0)}`;
  }
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function daysUntil(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
