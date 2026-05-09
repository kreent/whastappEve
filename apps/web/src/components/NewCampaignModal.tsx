"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

interface Template {
  id: string;
  name: string;
  language: string;
  status: string;
  components: Array<{ type: string; text?: string }>;
}

type ParameterMapping =
  | { index: number; kind: "static"; value: string }
  | { index: number; kind: "contact_field"; field: "name" | "profileName" | "phoneNumber" };

type AudienceFilter =
  | { kind: "all" }
  | { kind: "tag"; tag: string };

const VAR_REGEX = /\{\{(\d+)\}\}/g;

interface PreviewResp {
  audienceCount: number;
  samplePreview: Array<{ params: string[]; preview: string }>;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function NewCampaignModal({ onClose, onCreated }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState("");
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [paramMapping, setParamMapping] = useState<ParameterMapping[]>([]);
  const [audience, setAudience] = useState<AudienceFilter>({ kind: "all" });
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Template[]>("/api/templates")
      .then((all) => setTemplates(all.filter((t) => t.status === "approved")))
      .catch(() => setTemplates([]));
    api<{ items: Array<{ tags: string[] }> }>("/api/contacts?limit=100")
      .then((d) => {
        const all = new Set<string>();
        d.items.forEach((c) => c.tags.forEach((t) => all.add(t)));
        setTags(Array.from(all).sort());
      })
      .catch(() => {});
  }, []);

  const variableCount = useMemo(() => {
    if (!selectedTemplate) return 0;
    const body = selectedTemplate.components.find((c) => c.type === "BODY")?.text ?? "";
    const matches = [...body.matchAll(VAR_REGEX)];
    return new Set(matches.map((m) => Number(m[1]))).size;
  }, [selectedTemplate]);

  function pickTemplate(t: Template) {
    setSelectedTemplate(t);
    const body = t.components.find((c) => c.type === "BODY")?.text ?? "";
    const indices = Array.from(
      new Set([...body.matchAll(VAR_REGEX)].map((m) => Number(m[1]))),
    ).sort((a, b) => a - b);
    setParamMapping(
      indices.map<ParameterMapping>((i) => ({
        index: i,
        kind: "contact_field",
        field: "profileName",
      })),
    );
  }

  function setMapping(idx: number, partial: Partial<ParameterMapping>) {
    setParamMapping((prev) =>
      prev.map((m) =>
        m.index === idx ? ({ ...m, ...partial } as ParameterMapping) : m,
      ),
    );
  }

  async function loadPreview() {
    if (!selectedTemplate) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<PreviewResp>("/api/campaigns/preview", {
        method: "POST",
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          parameterMapping: paramMapping,
          audienceFilter: audience,
        }),
      });
      setPreview(data);
      setStep(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createAndSend() {
    if (!selectedTemplate) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name,
          templateId: selectedTemplate.id,
          parameterMapping: paramMapping,
          audienceFilter: audience,
        }),
      });
      await api(`/api/campaigns/${created.id}/send`, { method: "POST" });
      onCreated();
      router.push(`/broadcasts/${created.id}`);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-2xl rounded-lg shadow-lg max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Nueva campaña — paso {step}/4</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">×</button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              <Field label="Nombre interno de la campaña">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: confirmacion_cita_diciembre"
                  className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
                />
              </Field>
              <div className="text-xs text-slate-500">
                El nombre solo lo ves tú; el cliente verá el contenido de la plantilla.
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="text-sm text-slate-700">Selecciona una plantilla aprobada:</div>
              {templates === null && <div className="text-xs text-slate-400">Cargando...</div>}
              {templates && templates.length === 0 && (
                <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-3">
                  No hay plantillas aprobadas. Crea una en{" "}
                  <a className="underline text-brand-700" href="/templates">/templates</a> y espera la
                  aprobación de Meta.
                </div>
              )}
              <div className="space-y-2">
                {templates?.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => pickTemplate(t)}
                    className={`w-full text-left border rounded p-2.5 ${
                      selectedTemplate?.id === t.id
                        ? "border-brand-500 bg-brand-50"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <div className="font-mono text-xs text-slate-900">{t.name}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      {t.components.find((c) => c.type === "BODY")?.text}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              {variableCount > 0 && (
                <div>
                  <div className="text-sm text-slate-700 mb-2">
                    Mapea las variables ({variableCount}) a campos del cliente o valores fijos:
                  </div>
                  <div className="space-y-2">
                    {paramMapping.map((m) => (
                      <div key={m.index} className="border border-slate-200 rounded p-2.5">
                        <div className="text-xs text-slate-500 mb-1">
                          Variable <code>{`{{${m.index}}}`}</code>
                        </div>
                        <select
                          value={m.kind === "contact_field" ? `field:${m.field}` : "static"}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "static") {
                              setMapping(m.index, { kind: "static", value: "" } as ParameterMapping);
                            } else {
                              const field = v.replace("field:", "") as "name" | "profileName" | "phoneNumber";
                              setMapping(m.index, { kind: "contact_field", field } as ParameterMapping);
                            }
                          }}
                          className="w-full text-xs px-2 py-1 border border-slate-300 rounded"
                        >
                          <option value="field:profileName">Nombre del perfil de WhatsApp</option>
                          <option value="field:name">Nombre del cliente (BD)</option>
                          <option value="field:phoneNumber">Número de teléfono</option>
                          <option value="static">Valor fijo</option>
                        </select>
                        {m.kind === "static" && (
                          <input
                            value={m.value}
                            onChange={(e) =>
                              setMapping(m.index, { kind: "static", value: e.target.value } as ParameterMapping)
                            }
                            placeholder="Texto fijo para todos los destinatarios"
                            className="w-full text-xs px-2 py-1 border border-slate-300 rounded mt-1"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="border-t border-slate-200 pt-3">
                <div className="text-sm text-slate-700 mb-2">A quién se envía:</div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={audience.kind === "all"}
                      onChange={() => setAudience({ kind: "all" })}
                    />
                    Todos los clientes (excepto opt-out)
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      checked={audience.kind === "tag"}
                      onChange={() =>
                        setAudience({ kind: "tag", tag: tags[0] ?? "" })
                      }
                    />
                    <div className="flex-1">
                      Solo clientes con el tag:
                      {audience.kind === "tag" && (
                        <select
                          value={audience.tag}
                          onChange={(e) => setAudience({ kind: "tag", tag: e.target.value })}
                          className="ml-2 text-xs px-2 py-1 border border-slate-300 rounded"
                        >
                          <option value="">— elige un tag —</option>
                          {tags.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 4 && preview && selectedTemplate && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
                ⚠ Vas a enviar a <strong>{preview.audienceCount}</strong> clientes. Esta acción
                no se puede cancelar individualmente, solo la campaña entera.
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                  Preview (primeros 3 destinatarios)
                </div>
                <div className="space-y-2">
                  {preview.samplePreview.map((s, i) => (
                    <div key={i} className="bg-slate-50 border border-slate-200 rounded p-2 text-sm">
                      {s.preview}
                    </div>
                  ))}
                  {preview.samplePreview.length === 0 && (
                    <div className="text-xs text-slate-500">Sin destinatarios para preview.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex justify-between">
          <button
            onClick={() => (step === 1 ? onClose() : setStep((step - 1) as 1 | 2 | 3 | 4))}
            className="text-sm px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50"
          >
            {step === 1 ? "Cancelar" : "← Atrás"}
          </button>
          {step < 3 && (
            <button
              onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
              disabled={
                (step === 1 && !name.trim()) || (step === 2 && !selectedTemplate)
              }
              className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5 rounded"
            >
              Siguiente →
            </button>
          )}
          {step === 3 && (
            <button
              onClick={loadPreview}
              disabled={busy}
              className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5 rounded"
            >
              {busy ? "Cargando..." : "Vista previa →"}
            </button>
          )}
          {step === 4 && (
            <button
              onClick={createAndSend}
              disabled={busy || !preview || preview.audienceCount === 0}
              className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5 rounded"
            >
              {busy ? "Enviando..." : `Enviar a ${preview?.audienceCount ?? 0}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}
