"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Template {
  id: string;
  name: string;
  language: string;
  status: string;
  components: Array<{ type: string; text?: string }>;
}

interface FieldOption {
  value: string;
  label: string;
}

type ParameterMapping =
  | { index: number; kind: "static"; value: string }
  | { index: number; kind: "context_field"; field: string };

const VAR_REGEX = /\{\{(\d+)\}\}/g;

interface Props {
  contactId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewDebtModal({ contactId, onClose, onCreated }: Props) {
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [installmentCount, setInstallmentCount] = useState("4");
  const [paymentDay, setPaymentDay] = useState("15");
  const [firstDueDate, setFirstDueDate] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [paymentLink, setPaymentLink] = useState("");
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [paramMapping, setParamMapping] = useState<ParameterMapping[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Template[]>("/api/templates")
      .then((all) => setTemplates(all.filter((t) => t.status === "approved")))
      .catch(() => setTemplates([]));
    api<FieldOption[]>("/api/debts/fields")
      .then(setFields)
      .catch(() => setFields([]));
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
    // sensible defaults
    const defaults = [
      "contact.profileName",
      "installment.numberOfTotal",
      "installment.amountFormatted",
      "installment.dueDate",
      "paymentLink",
    ];
    setParamMapping(
      indices.map<ParameterMapping>((i, idx) => ({
        index: i,
        kind: "context_field",
        field: defaults[idx] ?? "contact.profileName",
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

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api("/api/debts", {
        method: "POST",
        body: JSON.stringify({
          contactId,
          description: description || undefined,
          totalAmount: Number(totalAmount),
          currency: "COP",
          installmentCount: Number(installmentCount),
          paymentDayOfMonth: Number(paymentDay),
          firstDueDate,
          paymentLink: paymentLink || undefined,
          templateId: selectedTemplate?.id,
          parameterMapping: paramMapping,
        }),
      });
      onCreated();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { details?: { fieldErrors?: Record<string, string[]> }; message?: string })
              ?.details?.fieldErrors
            ? Object.entries(
                (e.body as { details: { fieldErrors: Record<string, string[]> } }).details
                  .fieldErrors,
              )
                .map(([k, v]) => `${k}: ${v.join(", ")}`)
                .join(" · ")
            : (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-xl rounded-lg shadow-lg max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Nuevo crédito</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">×</button>
        </div>
        <div className="p-5 flex-1 overflow-y-auto space-y-3">
          <Field label="Descripción (opcional)">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Préstamo personal"
              className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto total (COP)">
              <input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="200000"
                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
              />
            </Field>
            <Field label="Número de cuotas">
              <input
                type="number"
                min="1"
                max="60"
                value={installmentCount}
                onChange={(e) => setInstallmentCount(e.target.value)}
                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Día de pago (1-31)">
              <input
                type="number"
                min="1"
                max="31"
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value)}
                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
              />
            </Field>
            <Field label="Primera cuota vence el">
              <input
                type="date"
                value={firstDueDate}
                onChange={(e) => setFirstDueDate(e.target.value)}
                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
              />
            </Field>
          </div>
          <Field label="Link de pago (opcional)">
            <input
              value={paymentLink}
              onChange={(e) => setPaymentLink(e.target.value)}
              placeholder="https://wompi.co/checkout/..."
              className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
            />
          </Field>

          <div className="border-t border-slate-200 pt-3">
            <div className="text-sm font-medium text-slate-700 mb-2">
              Plantilla del recordatorio
            </div>
            {templates === null && <div className="text-xs text-slate-400">Cargando...</div>}
            {templates && templates.length === 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                No hay plantillas aprobadas. Crea una en{" "}
                <a className="underline" href="/templates" target="_blank">/templates</a> con
                variables como <code>{`{{1}}, {{2}}...`}</code> y espera la aprobación de Meta.
              </div>
            )}
            <select
              value={selectedTemplate?.id ?? ""}
              onChange={(e) => {
                const t = templates?.find((x) => x.id === e.target.value);
                if (t) pickTemplate(t);
                else setSelectedTemplate(null);
              }}
              className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
            >
              <option value="">— sin plantilla (no envía recordatorio) —</option>
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language})
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <div className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-700">
                {selectedTemplate.components.find((c) => c.type === "BODY")?.text}
              </div>
            )}
            {variableCount > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">
                  Mapea las variables ({variableCount})
                </div>
                {paramMapping.map((m) => (
                  <div key={m.index} className="border border-slate-200 rounded p-2 space-y-1">
                    <div className="text-xs text-slate-500">
                      Variable <code>{`{{${m.index}}}`}</code>
                    </div>
                    <select
                      value={m.kind === "context_field" ? `field:${m.field}` : "static"}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "static") {
                          setMapping(m.index, { kind: "static", value: "" } as ParameterMapping);
                        } else {
                          setMapping(m.index, {
                            kind: "context_field",
                            field: v.replace("field:", ""),
                          } as ParameterMapping);
                        }
                      }}
                      className="w-full text-xs px-2 py-1 border border-slate-300 rounded"
                    >
                      {fields.map((f) => (
                        <option key={f.value} value={`field:${f.value}`}>
                          {f.label}
                        </option>
                      ))}
                      <option value="static">Valor fijo</option>
                    </select>
                    {m.kind === "static" && (
                      <input
                        value={m.value}
                        onChange={(e) =>
                          setMapping(m.index, { kind: "static", value: e.target.value } as ParameterMapping)
                        }
                        placeholder="Texto fijo"
                        className="w-full text-xs px-2 py-1 border border-slate-300 rounded"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

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
            onClick={save}
            disabled={busy || !totalAmount || !installmentCount || !paymentDay || !firstDueDate}
            className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5 rounded"
          >
            {busy ? "Guardando..." : "Crear crédito"}
          </button>
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
