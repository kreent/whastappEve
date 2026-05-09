"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface RedactedConfig {
  botUsername?: string;
  hasBotToken: boolean;
  webhookSecretToken?: string;
}

interface BotInfo {
  bot: { id: number; username: string; first_name: string };
  webhook: { url: string; pending_update_count: number; last_error_message?: string };
}

export default function TelegramSettings() {
  const [cfg, setCfg] = useState<RedactedConfig | null>(null);
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<BotInfo | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const c = await api<RedactedConfig | null>("/api/settings/telegram");
      setCfg(c);
      if (c) {
        setBotUsername(c.botUsername ?? "");
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
      const body: Record<string, string> = {};
      if (botToken) body.botToken = botToken;
      if (botUsername) body.botUsername = botUsername;
      if (webhookSecret) body.webhookSecretToken = webhookSecret;
      const updated = await api<RedactedConfig>("/api/settings/telegram", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setCfg(updated);
      setBotToken("");
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
      const r = await api<BotInfo>("/api/settings/telegram/test", { method: "POST" });
      setTest(r);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(msg);
    }
  }

  async function setupWebhook() {
    setError(null);
    setInfo(null);
    try {
      await api("/api/settings/telegram/webhook", {
        method: "POST",
        body: JSON.stringify({ url: webhookUrl }),
      });
      setInfo("Webhook configurado en Telegram.");
      await runTest();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { message?: string })?.message ?? e.message
          : (e as Error).message;
      setError(msg);
    }
  }

  async function disconnect() {
    if (!confirm("¿Eliminar configuración de Telegram?")) return;
    await api("/api/settings/telegram", { method: "DELETE" });
    setCfg(null);
    setBotToken("");
    setBotUsername("");
    setWebhookSecret("");
    setTest(null);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <Field label="Bot Token (de @BotFather)">
          <input
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={
              cfg?.hasBotToken
                ? "•••••••• (deja vacío para conservar)"
                : "1234567890:ABCdefGHIjkLmnoPQRstuVWXYZ"
            }
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded"
          />
        </Field>
        <Field label="Bot Username (con @)">
          <input
            value={botUsername}
            onChange={(e) => setBotUsername(e.target.value)}
            placeholder="@mi_bot"
            className="w-full text-sm px-3 py-2 border border-slate-300 rounded font-mono"
          />
        </Field>
        <Field label="Webhook Secret Token (opcional, recomendado)">
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
          {cfg?.hasBotToken ? (
            <button
              onClick={disconnect}
              className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded"
            >
              Desconectar
            </button>
          ) : <span />}
          <button
            onClick={save}
            disabled={busy || (!botToken && !cfg?.hasBotToken)}
            className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium"
          >
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {cfg?.hasBotToken && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="text-sm font-medium text-slate-700">Conexión y webhook</div>
          <button
            onClick={runTest}
            className="text-xs border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded"
          >
            Probar conexión con Telegram
          </button>
          {test && (
            <div className="text-xs bg-slate-50 border border-slate-200 rounded p-3 font-mono leading-relaxed">
              Bot: @{test.bot.username} ({test.bot.first_name}, id {test.bot.id})<br />
              Webhook: {test.webhook.url || <span className="text-amber-700">(sin configurar)</span>}<br />
              Pendientes: {test.webhook.pending_update_count}
              {test.webhook.last_error_message && (
                <>
                  <br />
                  <span className="text-red-700">Error: {test.webhook.last_error_message}</span>
                </>
              )}
            </div>
          )}
          <Field label="URL del webhook (apunta a tu API + /webhook/telegram)">
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://tu-api.up.railway.app/webhook/telegram"
              className="w-full text-sm px-3 py-2 border border-slate-300 rounded font-mono"
            />
          </Field>
          <button
            onClick={setupWebhook}
            disabled={!webhookUrl}
            className="text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded"
          >
            Configurar webhook en Telegram
          </button>
        </div>
      )}

      <div className="text-xs text-slate-500 leading-relaxed">
        <p className="font-medium mb-1">Cómo crear un bot</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Abre Telegram y busca <code>@BotFather</code>.</li>
          <li>Envía <code>/newbot</code>, sigue las instrucciones (nombre + username).</li>
          <li>BotFather te entrega un token: pégalo arriba.</li>
          <li>
            Para que tus clientes se conecten, comparte el link{" "}
            <code>https://t.me/&lt;tu_bot&gt;?start=&lt;contact_id&gt;</code>; al enviar /start
            quedan vinculados.
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
