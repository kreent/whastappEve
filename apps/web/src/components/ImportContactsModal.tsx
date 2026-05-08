"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Props {
  onClose: () => void;
  onImported: () => void;
}

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: Array<{ row: number; reason: string }>;
}

const SAMPLE_CSV = `phone,name,tags
573001112233,María García,cliente_premium
573002223344,Juan Pérez,lead
573003334455,Ana Rodríguez,
`;

export default function ImportContactsModal({ onClose, onImported }: Props) {
  const [csv, setCsv] = useState("");
  const [defaultTags, setDefaultTags] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
  }

  async function submit() {
    setImporting(true);
    setError(null);
    try {
      const tags = defaultTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const data = await api<ImportResult>("/api/contacts/import", {
        method: "POST",
        body: JSON.stringify({ csv, defaultTags: tags }),
      });
      setResult(data);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-lg rounded-lg shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-900">Importar contactos (CSV)</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">×</button>
        </div>
        <div className="p-5 space-y-3">
          {!result && (
            <>
              <div className="text-xs text-slate-500">
                Columnas aceptadas: <code>phone</code> (obligatoria), <code>name</code>, <code>tags</code>.
                Tags pueden ir separados por <code>,</code>, <code>;</code> o <code>|</code> dentro de la celda.
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                  Archivo CSV
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFile}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                  O pega el contenido aquí
                </label>
                <textarea
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  rows={8}
                  placeholder={SAMPLE_CSV}
                  className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                  Tags por defecto (opcional, separados por coma)
                </label>
                <input
                  value={defaultTags}
                  onChange={(e) => setDefaultTags(e.target.value)}
                  placeholder="lead, importado_dic2026"
                  className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
                />
              </div>
              {error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                  {error}
                </div>
              )}
            </>
          )}
          {result && (
            <div className="space-y-2 text-sm">
              <div className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
                Importación lista — total {result.total} filas:
                <ul className="mt-2 text-xs">
                  <li>✓ Creados: {result.created}</li>
                  <li>✓ Actualizados: {result.updated}</li>
                  <li>⚠ Saltados: {result.skipped.length}</li>
                </ul>
              </div>
              {result.skipped.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-600">Ver filas saltadas</summary>
                  <ul className="mt-2 max-h-40 overflow-y-auto bg-slate-50 border border-slate-200 rounded p-2">
                    {result.skipped.map((s) => (
                      <li key={s.row} className="text-slate-700">
                        fila {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          {!result ? (
            <>
              <button
                onClick={onClose}
                className="text-sm px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={importing || !csv.trim()}
                className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5 rounded"
              >
                {importing ? "Importando..." : "Importar"}
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                onImported();
                onClose();
              }}
              className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded"
            >
              Listo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
