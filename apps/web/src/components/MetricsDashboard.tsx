"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";

interface DashboardData {
  windowDays: number;
  totals: { inbound: number; outbound: number };
  statusBreakdown: Array<{ status: string; count: number }>;
  resolution: {
    totalResolved: number;
    byBot: number;
    byHuman: number;
    botShare: number;
  };
  contacts: { total: number; newInWindow: number };
  avgFirstResponseSeconds: number | null;
  daily: Array<{ day: string; inbound: number; outbound: number }>;
}

const STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  assigned: "#16a34a",
  pending: "#f59e0b",
  resolved: "#94a3b8",
  bot_handling: "#8b5cf6",
};

export default function MetricsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [days, setDays] = useState(14);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api<DashboardData>(`/api/metrics/dashboard?days=${days}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [days]);

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return <div className="text-sm text-slate-400">Cargando métricas...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Ventana:</span>
        {[7, 14, 30, 90].map((n) => (
          <button
            key={n}
            onClick={() => setDays(n)}
            className={`text-xs px-2.5 py-1 rounded border ${
              days === n
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {n}d
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Mensajes recibidos" value={data.totals.inbound.toString()} />
        <KPI label="Mensajes enviados" value={data.totals.outbound.toString()} />
        <KPI
          label="Resueltas por bot"
          value={`${(data.resolution.botShare * 100).toFixed(0)}%`}
          sub={`${data.resolution.byBot}/${data.resolution.totalResolved} totales`}
        />
        <KPI
          label="Tiempo de 1er respuesta"
          value={
            data.avgFirstResponseSeconds == null
              ? "—"
              : prettyDuration(data.avgFirstResponseSeconds)
          }
          sub="agente humano"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm font-medium text-slate-700 mb-3">
            Mensajes por día
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.daily} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#e2e8f0" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="inbound" name="Entrantes" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
              <Bar dataKey="outbound" name="Salientes" fill="#16a34a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm font-medium text-slate-700 mb-3">
            Conversaciones por estado
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.statusBreakdown}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(p) => {
                  const r = p as { status?: string; count?: number };
                  return `${r.status ?? ""}: ${r.count ?? 0}`;
                }}
                labelLine={false}
              >
                {data.statusBreakdown.map((s) => (
                  <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#e2e8f0" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KPI
          label="Clientes totales"
          value={data.contacts.total.toString()}
          sub={`${data.contacts.newInWindow} nuevos en ${days}d`}
        />
        <KPI
          label="Cobertura del bot"
          value={`${data.resolution.byBot} resueltas`}
          sub={`vs ${data.resolution.byHuman} por humanos`}
        />
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function prettyDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}
