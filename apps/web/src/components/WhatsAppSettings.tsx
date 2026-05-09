"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface RedactedConfig {
  phoneNumberId: string;
  businessAccountId?: string;
  apiVersion: string;
  webhookVerifyToken: string;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
}

export default function WhatsAppSettings() {
  const [cfg, setCfg] = useState<RedactedConfig | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [apiVersion, setApiVersion] = useState("v21.0");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<RedactedConfig>("/api/settings/whatsapp")
      .then((c) => {
        setCfg(c);
        setPhoneNumberId(c.phoneNumberId);
        setBusinessAccountId(c.businessAccountId ?? "");
        setVerifyToken(c.webhookVerifyToken);
        setApiVersion(c.apiVersion);
      })
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const body: Record<string, string> = {
        phoneNumberId,
        webhookVerifyToken: verifyToken,
        apiVersion,
      };
      if (businessAccountId) body.businessAccountId = businessAccountId;
      if (accessToken) body.accessToken = accessToken;
      if (appSecret) body.appSecret = appSecret;
      const updated = await api<RedactedConfig>("/api/settings/whatsapp", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setCfg(updated);
      setAccessToken("");
      setAppSecret("");
      setInfo("Guardado. Los cambios se aplican en menos de 30 segundos.");
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

  if (!cfg) return <div className="text-sm text-slate-400">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <Field label="Phone Number ID">
          <input
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded font-mono"
          />
        </Field>
        <Field label="Business Account ID">
          <input
            value={businessAccountId}
            onChange={(e) => setBusinessAccountId(e.target.value)}
            placeholder="(opcional, requerido para plantillas)"
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded font-mono"
          />
        </Field>
        <Field label="Access Token (System User permanente)">
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={cfg.hasAccessToken ? "•••••••• (deja vacío para conservar)" : "Pegue el token"}
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded"
          />
        </Field>
        <Field label="App Secret (para validar webhooks)">
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder={cfg.hasAppSecret ? "•••••••• (deja vacío para conservar)" : "Pegue el secret"}
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded"
          />
        </Field>
        <Field label="Webhook Verify Token (lo definís vos, igual que en Meta)">
          <input
            value={verifyToken}
            onChange={(e) => setVerifyToken(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded"
          />
        </Field>
        <Field label="API Version">
          <input
            value={apiVersion}
            onChange={(e) => setApiVersion(e.target.value)}
            placeholder="v21.0"
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded font-mono w-32"
          />
        </Field>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}
        {info && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
            {info}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={save}
            disabled={busy || !phoneNumberId || !verifyToken}
            className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium"
          >
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-500 leading-relaxed">
        <p className="font-medium mb-1">Cómo obtener cada valor</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            En <a href="https://developers.facebook.com" target="_blank" className="underline">developers.facebook.com</a>
            crea una app tipo "Business" y agrega el producto WhatsApp.
          </li>
          <li>Phone Number ID y Business Account ID están en API Setup.</li>
          <li>Crea un System User en Business Manager con permisos de WhatsApp y genera un token permanente.</li>
          <li>App Secret en Settings → Basic.</li>
          <li>El Webhook Verify Token lo definís acá y lo pones igual en Meta cuando configures el webhook.</li>
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
