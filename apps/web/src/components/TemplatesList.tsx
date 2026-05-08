"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";

interface Template {
  id: string;
  name: string;
  language: string;
  category: string;
  status: "draft" | "pending" | "approved" | "rejected" | "paused" | "disabled";
  metaTemplateId: string | null;
  rejectionReason: string | null;
  components: Array<{ type: string; text?: string; format?: string }>;
  lastSyncedAt: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<Template["status"], string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  paused: "bg-orange-100 text-orange-800",
  disabled: "bg-slate-200 text-slate-600",
};

export default function TemplatesList({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Template[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api<Template[]>("/api/templates");
    setItems(data);
  }

  useEffect(() => {
    load().catch(() => setItems([]));
  }, []);

  async function syncFromMeta() {
    setSyncing(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api<{ synced: number }>("/api/templates/sync", { method: "POST" });
      setInfo(`Sincronizadas ${res.synced} plantillas desde Meta.`);
      await load();
    } catch (e) {
      const message =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(`No se pudo sincronizar: ${message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function submit(id: string) {
    setError(null);
    setInfo(null);
    try {
      await api(`/api/templates/${id}/submit`, { method: "POST" });
      setInfo("Plantilla enviada a Meta para aprobación.");
      await load();
    } catch (e) {
      const message =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(`No se pudo enviar: ${message}`);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar la plantilla?")) return;
    try {
      await api(`/api/templates/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (items === null) return <div className="text-sm text-slate-400">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-slate-200">
          <div className="text-sm text-slate-500">{items.length} plantillas</div>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <button
                  onClick={syncFromMeta}
                  disabled={syncing}
                  className="text-xs border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded disabled:opacity-50"
                >
                  {syncing ? "Sincronizando..." : "Sincronizar desde Meta"}
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-xs bg-brand-600 hover:bg-brand-700 text-white font-medium px-3 py-1.5 rounded"
                >
                  + Nueva plantilla
                </button>
              </>
            )}
          </div>
        </div>

        {info && (
          <div className="px-3 py-2 text-xs text-emerald-800 bg-emerald-50 border-b border-emerald-200">
            {info}
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-xs text-red-800 bg-red-50 border-b border-red-200">
            {error}
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Categoría</th>
              <th className="px-4 py-2 font-medium">Idioma</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-slate-400 text-center">
                  Sin plantillas. Crea una nueva o sincroniza desde Meta.
                </td>
              </tr>
            )}
            {items.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2.5">
                  <div className="font-mono text-xs text-slate-900">{t.name}</div>
                  <div className="text-xs text-slate-500 line-clamp-2 max-w-md">
                    {bodyTextOf(t.components)}
                  </div>
                  {t.rejectionReason && (
                    <div className="text-xs text-red-600 mt-1">
                      Rechazo: {t.rejectionReason}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-700 text-xs">{t.category}</td>
                <td className="px-4 py-2.5 text-slate-700 text-xs">{t.language}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={clsx(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      STATUS_STYLES[t.status],
                    )}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right space-x-2">
                  {isAdmin && (t.status === "draft" || t.status === "rejected") && (
                    <>
                      <button
                        onClick={() => submit(t.id)}
                        className="text-xs text-brand-700 hover:underline"
                      >
                        Enviar a Meta
                      </button>
                      <button
                        onClick={() => remove(t.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateTemplateModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function bodyTextOf(components: Template["components"]): string {
  return components.find((c) => c.type === "BODY")?.text ?? "";
}

function CreateTemplateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("UTILITY");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const components: Array<{ type: string; text?: string }> = [
        { type: "BODY", text: body },
      ];
      if (footer) components.push({ type: "FOOTER", text: footer });
      await api("/api/templates", {
        method: "POST",
        body: JSON.stringify({ name, language, category, components }),
      });
      onCreated();
    } catch (e) {
      const message =
        e instanceof ApiError
          ? (e.body as { details?: { fieldErrors?: Record<string, string[]> } })?.details?.fieldErrors
              ? Object.entries(
                  (e.body as { details: { fieldErrors: Record<string, string[]> } }).details
                    .fieldErrors,
                )
                  .map(([k, v]) => `${k}: ${v.join(", ")}`)
                  .join(" · ")
              : e.message
          : (e as Error).message;
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-lg rounded-lg shadow-lg">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Nueva plantilla</h2>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Nombre interno (snake_case)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="welcome_message"
              className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded font-mono"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Idioma">
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="es"
                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
              />
            </Field>
            <Field label="Categoría">
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as "MARKETING" | "UTILITY" | "AUTHENTICATION")
                }
                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
              >
                <option value="UTILITY">UTILITY</option>
                <option value="MARKETING">MARKETING</option>
                <option value="AUTHENTICATION">AUTHENTICATION</option>
              </select>
            </Field>
          </div>
          <Field label="Cuerpo del mensaje">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Hola {{1}}, te confirmamos tu cita para el {{2}}."
              className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded resize-y"
            />
            <div className="text-[11px] text-slate-500 mt-1">
              Usa {"{{1}}"}, {"{{2}}"}... para variables.
            </div>
          </Field>
          <Field label="Footer (opcional)">
            <input
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded"
            />
          </Field>
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
            disabled={saving || !name || !body}
            className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5 rounded"
          >
            {saving ? "Guardando..." : "Crear como draft"}
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
