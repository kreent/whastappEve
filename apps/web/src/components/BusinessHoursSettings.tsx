"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ScheduleEntry {
  weekday: number;
  openMinute: number;
  closeMinute: number;
}

interface BusinessHours {
  enabled: boolean;
  timezone: string;
  schedule: ScheduleEntry[];
  awayMessage: string;
}

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export default function BusinessHoursSettings() {
  const [cfg, setCfg] = useState<BusinessHours | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    api<BusinessHours>("/api/settings/business-hours").then(setCfg).catch(() => {});
  }, []);

  function setDay(weekday: number, partial: Partial<ScheduleEntry> | null) {
    setCfg((prev) => {
      if (!prev) return prev;
      let schedule = prev.schedule.filter((s) => s.weekday !== weekday);
      if (partial !== null) {
        const existing = prev.schedule.find((s) => s.weekday === weekday);
        const merged: ScheduleEntry = {
          weekday,
          openMinute: existing?.openMinute ?? 9 * 60,
          closeMinute: existing?.closeMinute ?? 18 * 60,
          ...partial,
        };
        schedule = [...schedule, merged];
      }
      schedule.sort((a, b) => a.weekday - b.weekday);
      return { ...prev, schedule };
    });
  }

  async function save() {
    if (!cfg) return;
    setBusy(true);
    setInfo(null);
    try {
      await api("/api/settings/business-hours", {
        method: "PUT",
        body: JSON.stringify(cfg),
      });
      setInfo("Horario guardado.");
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <div className="text-sm text-slate-400">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          />
          Activar horario de atención (fuera de horario, el bot envía mensaje de ausencia)
        </label>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Zona horaria</div>
          <input
            value={cfg.timezone}
            onChange={(e) => setCfg({ ...cfg, timezone: e.target.value })}
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded font-mono"
          />
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Horario semanal</div>
          <div className="space-y-1.5">
            {DAYS.map((label, idx) => {
              const entry = cfg.schedule.find((s) => s.weekday === idx);
              const enabled = !!entry;
              return (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-2 w-32">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setDay(idx, e.target.checked ? {} : null)}
                    />
                    {label}
                  </label>
                  {enabled ? (
                    <>
                      <input
                        type="time"
                        value={minToHHMM(entry!.openMinute)}
                        onChange={(e) => setDay(idx, { openMinute: hhmmToMin(e.target.value) })}
                        className="text-sm px-2 py-1 border border-slate-300 rounded"
                      />
                      <span className="text-slate-400">a</span>
                      <input
                        type="time"
                        value={minToHHMM(entry!.closeMinute)}
                        onChange={(e) => setDay(idx, { closeMinute: hhmmToMin(e.target.value) })}
                        className="text-sm px-2 py-1 border border-slate-300 rounded"
                      />
                    </>
                  ) : (
                    <span className="text-slate-400 text-xs">cerrado</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
            Mensaje de ausencia
          </div>
          <textarea
            value={cfg.awayMessage}
            onChange={(e) => setCfg({ ...cfg, awayMessage: e.target.value })}
            rows={3}
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded resize-y"
          />
        </div>

        {info && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
            {info}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={save}
            disabled={busy}
            className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium"
          >
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
