"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import type { ConversationDetail, Message, User } from "@/lib/types";
import { statusLabel } from "@/lib/format";
import MessageBubble from "./MessageBubble";
import ContactPanel from "./ContactPanel";
import SendTemplateModal from "./SendTemplateModal";

const POLL_MS = 3000;

interface Props {
  conversationId: string;
  user: User;
}

export default function ChatView({ conversationId, user }: Props) {
  const router = useRouter();
  const [data, setData] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function load() {
      try {
        const d = await api<ConversationDetail>(`/api/conversations/${conversationId}`);
        if (alive) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) timer = setTimeout(load, POLL_MS);
      }
    }
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [conversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.messages.length]);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const created = await api<{ message: Message }>(
        `/api/conversations/${conversationId}/messages`,
        { method: "POST", body: JSON.stringify({ body }) },
      );
      setBody("");
      setData((prev) =>
        prev ? { ...prev, messages: [...prev.messages, created.message] } : prev,
      );
    } catch (e) {
      if (e instanceof ApiError) {
        setSendError(
          e.status === 409
            ? "La ventana de 24h está cerrada. Usa una plantilla aprobada."
            : (e.body as { message?: string })?.message ?? e.message,
        );
      } else {
        setSendError((e as Error).message);
      }
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(status: string) {
    try {
      await api(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch {}
  }

  async function takeOver() {
    try {
      await api(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "assigned", assignedAgentId: user.id }),
      });
    } catch {}
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  if (!data) {
    return (
      <div className="p-6 text-sm text-slate-400">Cargando conversación...</div>
    );
  }

  const status = statusLabel(data.status);
  const contactName =
    data.contact.profileName ?? data.contact.name ?? data.contact.phoneNumber;

  return (
    <div className="flex flex-1 min-w-0">
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">{contactName}</div>
            <div className="text-xs text-slate-500">{data.contact.phoneNumber}</div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                status.className,
              )}
            >
              {status.label}
            </span>
            {data.assignedAgentId !== user.id && (
              <button
                onClick={takeOver}
                className="text-xs px-2 py-1 border border-brand-500 text-brand-700 rounded hover:bg-brand-50"
              >
                Tomar conversación
              </button>
            )}
            {data.status !== "resolved" && (
              <button
                onClick={() => changeStatus("resolved")}
                className="text-xs px-2 py-1 border border-slate-300 text-slate-600 rounded hover:bg-slate-100"
              >
                Marcar resuelta
              </button>
            )}
            <button
              onClick={() => router.refresh()}
              className="text-xs text-slate-400 hover:text-slate-700"
              title="Recargar"
            >
              ↻
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          {data.messages.length === 0 ? (
            <div className="text-center text-sm text-slate-400 mt-12">
              Sin mensajes en esta conversación.
            </div>
          ) : (
            data.messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-3">
          {!data.windowOpen && (
            <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-center justify-between">
              <span>⚠ Ventana de 24h cerrada. Solo puedes enviar plantillas aprobadas.</span>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="text-xs bg-brand-600 hover:bg-brand-700 text-white px-2 py-1 rounded"
              >
                Enviar plantilla
              </button>
            </div>
          )}
          {sendError && (
            <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {sendError}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                data.windowOpen
                  ? "Escribe un mensaje... (Enter para enviar)"
                  : "Ventana cerrada"
              }
              disabled={!data.windowOpen}
              className="flex-1 min-h-[40px] max-h-32 px-3 py-2 border border-slate-300 rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-400"
              rows={1}
            />
            <button
              onClick={send}
              disabled={sending || !body.trim() || !data.windowOpen}
              className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              {sending ? "..." : "Enviar"}
            </button>
          </div>
        </div>
      </div>

      <ContactPanel data={data} />

      {showTemplateModal && (
        <SendTemplateModal
          conversationId={conversationId}
          onClose={() => setShowTemplateModal(false)}
          onSent={() => setShowTemplateModal(false)}
        />
      )}
    </div>
  );
}
