"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { ConversationDetail, Note } from "@/lib/types";
import { formatRelative } from "@/lib/format";

interface Props {
  data: ConversationDetail;
}

export default function ContactPanel({ data }: Props) {
  const [tags, setTags] = useState<string[]>(data.contact.tags);
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState<Note[]>(data.notes);
  const [noteContent, setNoteContent] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  async function persistTags(next: string[]) {
    setSavingTag(true);
    try {
      await api(`/api/contacts/${data.contact.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tags: next }),
      });
      setTags(next);
    } catch {
      // surface later if needed
    } finally {
      setSavingTag(false);
    }
  }

  async function addTag() {
    const v = newTag.trim();
    if (!v || tags.includes(v)) {
      setNewTag("");
      return;
    }
    await persistTags([...tags, v]);
    setNewTag("");
  }

  async function removeTag(tag: string) {
    await persistTags(tags.filter((t) => t !== tag));
  }

  async function addNote() {
    const v = noteContent.trim();
    if (!v) return;
    setSavingNote(true);
    try {
      const created = await api<Note>(
        `/api/conversations/${data.id}/notes`,
        { method: "POST", body: JSON.stringify({ content: v }) },
      );
      setNotes([created, ...notes]);
      setNoteContent("");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <aside className="w-80 border-l border-slate-200 bg-white overflow-y-auto scrollbar-thin">
      <div className="p-4 border-b border-slate-100">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
          Cliente
        </div>
        <div className="font-semibold text-slate-900">
          {data.contact.profileName ?? data.contact.name ?? "Sin nombre"}
        </div>
        <div className="text-sm text-slate-500">{data.contact.phoneNumber}</div>
        <div className="text-xs text-slate-400 mt-1">
          Cliente desde {new Date(data.contact.createdAt).toLocaleDateString("es-CO")}
        </div>
      </div>

      <div className="p-4 border-b border-slate-100">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
          Tags
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.length === 0 && (
            <span className="text-xs text-slate-400">Sin tags</span>
          )}
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full"
            >
              {t}
              <button
                onClick={() => removeTag(t)}
                className="text-slate-400 hover:text-slate-700"
                title="Quitar"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="agregar tag..."
            className="flex-1 text-xs px-2 py-1 border border-slate-300 rounded"
          />
          <button
            onClick={addTag}
            disabled={savingTag}
            className="text-xs px-2 py-1 bg-slate-900 text-white rounded disabled:opacity-50"
          >
            +
          </button>
        </div>
      </div>

      <div className="p-4 border-b border-slate-100">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
          Conversación
        </div>
        <dl className="text-xs space-y-1">
          <div className="flex justify-between">
            <dt className="text-slate-500">Estado</dt>
            <dd className="text-slate-900">{data.status}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Ventana 24h</dt>
            <dd className={data.windowOpen ? "text-emerald-700" : "text-amber-700"}>
              {data.windowOpen ? "Abierta" : "Cerrada"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Bot flow</dt>
            <dd className="text-slate-900 truncate ml-2">
              {data.currentFlow?.name ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Mensajes</dt>
            <dd className="text-slate-900">{data._count?.messages ?? data.messages.length}</dd>
          </div>
        </dl>
      </div>

      <div className="p-4">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
          Notas internas
        </div>
        <div className="flex flex-col gap-2 mb-3">
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Nota privada (no la ve el cliente)..."
            rows={2}
            className="text-xs px-2 py-1.5 border border-slate-300 rounded resize-y focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            onClick={addNote}
            disabled={savingNote || !noteContent.trim()}
            className="self-end text-xs px-2 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded"
          >
            Guardar nota
          </button>
        </div>
        <div className="space-y-2">
          {notes.length === 0 && (
            <div className="text-xs text-slate-400">Sin notas todavía.</div>
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              className="text-xs bg-amber-50 border border-amber-200 rounded p-2"
            >
              <div className="text-slate-900 whitespace-pre-wrap">{n.content}</div>
              <div className="text-[10px] text-slate-500 mt-1">
                {n.user.name} · {formatRelative(n.createdAt)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
