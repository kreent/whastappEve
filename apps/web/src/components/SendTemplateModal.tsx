"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Template {
  id: string;
  name: string;
  language: string;
  status: string;
  components: Array<{ type: string; text?: string }>;
}

interface Props {
  conversationId: string;
  onClose: () => void;
  onSent: () => void;
}

const VAR_REGEX = /\{\{(\d+)\}\}/g;

export default function SendTemplateModal({ conversationId, onClose, onSent }: Props) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<Template[]>("/api/templates")
      .then((all) => setTemplates(all.filter((t) => t.status === "approved")))
      .catch(() => setTemplates([]));
  }, []);

  function pickTemplate(t: Template) {
    setSelected(t);
    const body = t.components.find((c) => c.type === "BODY")?.text ?? "";
    const matches = [...body.matchAll(VAR_REGEX)];
    const count = new Set(matches.map((m) => Number(m[1]))).size;
    setParams(Array(count).fill(""));
  }

  async function send() {
    if (!selected) return;
    setError(null);
    setSending(true);
    try {
      await api(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ kind: "template", templateId: selected.id, parameters: params }),
      });
      onSent();
    } catch (e) {
      const message =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-md rounded-lg shadow-lg">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Enviar plantilla</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>
        <div className="p-5 space-y-3">
          {templates === null && <div className="text-sm text-slate-400">Cargando...</div>}
          {templates && templates.length === 0 && (
            <div className="text-sm text-slate-500">
              No hay plantillas aprobadas. Crea y aprueba una en{" "}
              <a className="text-brand-700 underline" href="/templates">/templates</a>.
            </div>
          )}
          {templates && templates.length > 0 && !selected && (
            <div className="space-y-2">
              <div className="text-xs text-slate-500">Plantillas aprobadas:</div>
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickTemplate(t)}
                  className="w-full text-left border border-slate-200 hover:border-brand-500 rounded p-2"
                >
                  <div className="font-mono text-xs text-slate-900">{t.name}</div>
                  <div className="text-xs text-slate-500 line-clamp-2">
                    {t.components.find((c) => c.type === "BODY")?.text}
                  </div>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                Plantilla:{" "}
                <code className="bg-slate-100 px-1 rounded">{selected.name}</code>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-2 text-sm">
                {selected.components.find((c) => c.type === "BODY")?.text}
              </div>
              {params.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">
                    Variables
                  </div>
                  {params.map((v, i) => (
                    <input
                      key={i}
                      value={v}
                      onChange={(e) => {
                        const next = [...params];
                        next[i] = e.target.value;
                        setParams(next);
                      }}
                      placeholder={`{{${i + 1}}}`}
                      className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
                    />
                  ))}
                </div>
              )}
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500 hover:underline"
              >
                ← Cambiar plantilla
              </button>
            </div>
          )}
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={send}
            disabled={!selected || sending || params.some((p) => !p)}
            className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5 rounded"
          >
            {sending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
