"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface RedactedConfig {
  baseUrl: string;
  defaultRedirectUrl?: string;
  webhookSecretToken?: string;
  hasApiToken: boolean;
}

export default function ComboPaySettings() {
  const [cfg, setCfg] = useState<RedactedConfig | null>(null);
  const [apiToken, setApiToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.combopay.co");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ bankCount: number } | null>(null);

  async function load() {
    try {
      const c = await api<RedactedConfig | null>("/api/settings/combopay");
      setCfg(c);
      if (c) {
        setBaseUrl(c.baseUrl);
        setRedirectUrl(c.defaultRedirectUrl ?? "");
        setWebhookSecret(c.webhookSecretToken ?? "");
      }
    } catch {
      setCfg(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const body: Record<string, string | null> = { baseUrl };
      if (apiToken) body.apiToken = apiToken;
      body.defaultRedirectUrl = redirectUrl || null;
      body.webhookSecretToken = webhookSecret || null;
      const updated = await api<RedactedConfig>("/api/settings/combopay", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setCfg(updated);
      setApiToken("");
      setInfo("Guardado.");
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setError(null);
    setInfo(null);
    try {
      const r = await api<{ ok: boolean; bankCount: number }>("/api/settings/combopay/test", {
        method: "POST",
      });
      setTest(r);
      setInfo(`Conexión OK. ComboPay devolvió ${r.bankCount} bancos PSE disponibles.`);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(msg);
    }
  }

  async function disconnect() {
    if (!confirm("¿Eliminar configuración de ComboPay?")) return;
    await api("/api/settings/combopay", { method: "DELETE" });
    setCfg(null);
    setApiToken("");
    setRedirectUrl("");
    setWebhookSecret("");
    setTest(null);
  }

  const apiBase =
    typeof window !== "undefined"
      ? window.location.origin.replace(":3001", ":3000")
      : "";

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <Field label="API Token (Bearer)">
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={cfg?.hasApiToken ? "•••••••• (deja vacío para conservar)" : "3fb6XXXXXXXXXX..."}
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded"
          />
        </Field>
        <Field label="Base URL de ComboPay">
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.combopay.co"
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded font-mono"
          />
        </Field>
        <Field label="URL de redirección al cliente tras pagar (opcional)">
          <input
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
            placeholder="https://tudominio.com/gracias"
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded"
          />
        </Field>
        <Field label="Webhook Secret (opcional, recomendado)">
          <input
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="cualquier string aleatorio"
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded font-mono"
          />
        </Field>
        {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        {info && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">{info}</div>}
        <div className="flex justify-between pt-2">
          {cfg?.hasApiToken ? (
            <button
              onClick={disconnect}
              className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded"
            >
              Desconectar
            </button>
          ) : <span />}
          <button
            onClick={save}
            disabled={busy || (!apiToken && !cfg?.hasApiToken)}
            className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium"
          >
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {cfg?.hasApiToken && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="text-sm font-medium text-slate-700">Validar credenciales</div>
          <button
            onClick={runTest}
            className="text-xs border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded"
          >
            Probar conexión con ComboPay
          </button>
          {test && (
            <div className="text-xs bg-slate-50 border border-slate-200 rounded p-3 font-mono">
              ✓ Token válido · {test.bankCount} bancos PSE disponibles
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="text-sm font-medium text-slate-700 mb-2">URL para configurar en ComboPay</div>
        <div className="text-xs text-slate-500 mb-2">
          Pega esta URL en el panel de ComboPay como webhook de notificaciones (campo
          <code className="bg-slate-100 px-1 mx-1 rounded">url_data_return</code>):
        </div>
        <code className="block bg-slate-100 text-slate-900 px-2 py-1.5 rounded text-xs break-all">
          {apiBase}/webhook/combopay
          {webhookSecret ? `?secret=${encodeURIComponent(webhookSecret)}` : ""}
        </code>
      </div>

      <div className="text-xs text-slate-500 leading-relaxed">
        <p className="font-medium mb-1">Cómo funciona</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Guarda aquí el token Bearer que te entregó ComboPay (panel API Keys).
          </li>
          <li>
            Configura el webhook (URL de arriba) en ComboPay para recibir notificaciones.
          </li>
          <li>
            Al asignar un crédito a un cliente, deja el "Link de pago" vacío. El sistema
            generará un link único por cuota llamando a ComboPay justo antes de enviar
            el recordatorio diario.
          </li>
          <li>
            Cuando el cliente pague, ComboPay nos avisa por webhook y la cuota se marca
            como <strong>pagada</strong> automáticamente.
          </li>
        </ol>
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
