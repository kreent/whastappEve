"use client";

import type {
  ButtonsNode,
  ConditionBranch,
  ConditionNode,
  EndNode,
  FlowNode,
  HandoffNode,
  ListNode,
  ListRow,
  MessageNode,
  QuestionNode,
  ActionNode,
} from "@/lib/flow-types";
import { NODE_TYPE_META } from "@/lib/flow-types";

interface Props {
  node: FlowNode | null;
  isStart: boolean;
  onChange: (node: FlowNode) => void;
  onDelete: () => void;
  onMakeStart: () => void;
}

export default function Inspector({ node, isStart, onChange, onDelete, onMakeStart }: Props) {
  if (!node) {
    return (
      <aside className="w-80 border-l border-slate-200 bg-white p-4 text-sm text-slate-400">
        Selecciona un nodo para editarlo. Arrastra desde la paleta para crear uno nuevo.
      </aside>
    );
  }
  const meta = NODE_TYPE_META[node.type];
  return (
    <aside className="w-80 border-l border-slate-200 bg-white overflow-y-auto scrollbar-thin">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{meta.icon}</span>
          <span className="text-sm font-semibold">{meta.label}</span>
        </div>
        <div className="flex gap-1">
          {!isStart && (
            <button
              onClick={onMakeStart}
              className="text-[11px] text-brand-700 border border-brand-300 rounded px-1.5 py-0.5 hover:bg-brand-50"
              title="Marcar como nodo inicial"
            >
              ⭐ Inicial
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-[11px] text-red-600 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 text-sm">
        <Field label="ID del nodo">
          <input
            value={node.id}
            onChange={(e) => onChange({ ...node, id: e.target.value })}
            className="w-full text-xs px-2 py-1 border border-slate-300 rounded font-mono"
          />
        </Field>

        {node.type === "message" && <MessageForm node={node} onChange={onChange} />}
        {node.type === "question" && <QuestionForm node={node} onChange={onChange} />}
        {node.type === "buttons" && <ButtonsForm node={node} onChange={onChange} />}
        {node.type === "list" && <ListForm node={node} onChange={onChange} />}
        {node.type === "condition" && <ConditionForm node={node} onChange={onChange} />}
        {node.type === "action" && <ActionForm node={node} onChange={onChange} />}
        {(node.type === "handoff" || node.type === "end") && (
          <TerminalForm node={node} onChange={onChange} />
        )}
      </div>
    </aside>
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

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      {...props}
      className={
        "w-full text-xs px-2 py-1 border border-slate-300 rounded resize-y " +
        (props.className ?? "")
      }
    />
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full text-xs px-2 py-1 border border-slate-300 rounded " + (props.className ?? "")
      }
    />
  );
}

function MessageForm({ node, onChange }: { node: MessageNode; onChange: (n: FlowNode) => void }) {
  return (
    <Field label="Texto del mensaje">
      <TextArea
        value={node.text}
        onChange={(e) => onChange({ ...node, text: e.target.value })}
      />
    </Field>
  );
}

function QuestionForm({ node, onChange }: { node: QuestionNode; onChange: (n: FlowNode) => void }) {
  return (
    <>
      <Field label="Pregunta">
        <TextArea
          value={node.text}
          onChange={(e) => onChange({ ...node, text: e.target.value })}
        />
      </Field>
      <Field label="Guardar respuesta como">
        <TextInput
          value={node.saveAs}
          onChange={(e) => onChange({ ...node, saveAs: e.target.value })}
          placeholder="nombre_variable"
        />
      </Field>
    </>
  );
}

function ButtonsForm({ node, onChange }: { node: ButtonsNode; onChange: (n: FlowNode) => void }) {
  return (
    <>
      <Field label="Texto">
        <TextArea
          value={node.text}
          onChange={(e) => onChange({ ...node, text: e.target.value })}
        />
      </Field>
      <Field label="Footer (opcional)">
        <TextInput
          value={node.footer ?? ""}
          onChange={(e) => onChange({ ...node, footer: e.target.value || undefined })}
        />
      </Field>
      <Field label="Guardar selección como (opcional)">
        <TextInput
          value={node.saveAs ?? ""}
          onChange={(e) => onChange({ ...node, saveAs: e.target.value || undefined })}
        />
      </Field>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
          Botones (máx 3)
        </div>
        <div className="space-y-2">
          {node.buttons.map((b, i) => (
            <div key={i} className="border border-slate-200 rounded p-2 space-y-1">
              <TextInput
                placeholder="ID (ej: opt_yes)"
                value={b.id}
                onChange={(e) => {
                  const buttons = [...node.buttons];
                  buttons[i] = { ...b, id: e.target.value };
                  onChange({ ...node, buttons });
                }}
              />
              <TextInput
                placeholder="Título visible"
                value={b.title}
                onChange={(e) => {
                  const buttons = [...node.buttons];
                  buttons[i] = { ...b, title: e.target.value };
                  onChange({ ...node, buttons });
                }}
              />
              <button
                onClick={() => {
                  const buttons = node.buttons.filter((_, j) => j !== i);
                  onChange({ ...node, buttons });
                }}
                className="text-[11px] text-red-600 hover:underline"
              >
                Quitar
              </button>
            </div>
          ))}
          {node.buttons.length < 3 && (
            <button
              onClick={() => {
                const next = [
                  ...node.buttons,
                  { id: `opt_${node.buttons.length + 1}`, title: "Nueva", goto: "" },
                ];
                onChange({ ...node, buttons: next });
              }}
              className="text-xs text-brand-700 hover:underline"
            >
              + Agregar botón
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function ListForm({ node, onChange }: { node: ListNode; onChange: (n: FlowNode) => void }) {
  function setRow(secIdx: number, rowIdx: number, partial: Partial<ListRow>) {
    const sections = node.sections.map((s, i) =>
      i === secIdx
        ? { ...s, rows: s.rows.map((r, j) => (j === rowIdx ? { ...r, ...partial } : r)) }
        : s,
    );
    onChange({ ...node, sections });
  }
  return (
    <>
      <Field label="Texto">
        <TextArea
          value={node.text}
          onChange={(e) => onChange({ ...node, text: e.target.value })}
        />
      </Field>
      <Field label="Texto del botón principal">
        <TextInput
          value={node.buttonText}
          onChange={(e) => onChange({ ...node, buttonText: e.target.value })}
        />
      </Field>
      {node.sections.map((s, si) => (
        <div key={si} className="border border-slate-200 rounded p-2 space-y-1">
          <TextInput
            placeholder="Título de sección"
            value={s.title ?? ""}
            onChange={(e) => {
              const sections = node.sections.map((sec, i) =>
                i === si ? { ...sec, title: e.target.value || undefined } : sec,
              );
              onChange({ ...node, sections });
            }}
          />
          {s.rows.map((r, ri) => (
            <div key={ri} className="bg-slate-50 rounded p-1.5 space-y-1">
              <TextInput
                placeholder="ID"
                value={r.id}
                onChange={(e) => setRow(si, ri, { id: e.target.value })}
              />
              <TextInput
                placeholder="Título"
                value={r.title}
                onChange={(e) => setRow(si, ri, { title: e.target.value })}
              />
              <TextInput
                placeholder="Descripción (opcional)"
                value={r.description ?? ""}
                onChange={(e) => setRow(si, ri, { description: e.target.value || undefined })}
              />
            </div>
          ))}
          <button
            onClick={() => {
              const sections = node.sections.map((sec, i) =>
                i === si
                  ? {
                      ...sec,
                      rows: [
                        ...sec.rows,
                        { id: `row_${sec.rows.length + 1}`, title: "Nueva", goto: "" },
                      ],
                    }
                  : sec,
              );
              onChange({ ...node, sections });
            }}
            className="text-xs text-brand-700 hover:underline"
          >
            + Fila
          </button>
        </div>
      ))}
    </>
  );
}

function ConditionForm({ node, onChange }: { node: ConditionNode; onChange: (n: FlowNode) => void }) {
  function setBranch(i: number, partial: Partial<ConditionBranch>) {
    const branches = node.branches.map((b, idx) => (idx === i ? { ...b, ...partial } : b));
    onChange({ ...node, branches });
  }
  return (
    <>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
        Ramas (en orden)
      </div>
      {node.branches.map((b, i) => (
        <div key={i} className="border border-slate-200 rounded p-2 space-y-1">
          <TextInput
            placeholder="Variable"
            value={b.variable}
            onChange={(e) => setBranch(i, { variable: e.target.value })}
          />
          <select
            value={b.operator}
            onChange={(e) => setBranch(i, { operator: e.target.value as ConditionBranch["operator"] })}
            className="w-full text-xs px-2 py-1 border border-slate-300 rounded"
          >
            <option value="equals">equals</option>
            <option value="not_equals">not_equals</option>
            <option value="contains">contains</option>
            <option value="exists">exists</option>
            <option value="matches">matches (regex)</option>
          </select>
          {b.operator !== "exists" && (
            <TextInput
              placeholder="Valor a comparar"
              value={b.value ?? ""}
              onChange={(e) => setBranch(i, { value: e.target.value })}
            />
          )}
          <button
            onClick={() => onChange({ ...node, branches: node.branches.filter((_, j) => j !== i) })}
            className="text-[11px] text-red-600 hover:underline"
          >
            Quitar rama
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          onChange({
            ...node,
            branches: [
              ...node.branches,
              { variable: "respuesta", operator: "equals", value: "", goto: "" },
            ],
          })
        }
        className="text-xs text-brand-700 hover:underline"
      >
        + Agregar rama
      </button>
    </>
  );
}

function ActionForm({ node, onChange }: { node: ActionNode; onChange: (n: FlowNode) => void }) {
  return (
    <>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Acciones</div>
      {node.actions.map((a, i) => (
        <div key={i} className="border border-slate-200 rounded p-2 space-y-1">
          <select
            value={a.kind}
            onChange={(e) => {
              const kind = e.target.value as "set" | "tag_contact";
              const actions = node.actions.map((act, idx) =>
                idx === i
                  ? kind === "set"
                    ? { kind, variable: "", value: "" }
                    : { kind, tag: "" }
                  : act,
              );
              onChange({ ...node, actions });
            }}
            className="w-full text-xs px-2 py-1 border border-slate-300 rounded"
          >
            <option value="set">set variable</option>
            <option value="tag_contact">tag contacto</option>
          </select>
          {a.kind === "set" ? (
            <>
              <TextInput
                placeholder="variable"
                value={a.variable}
                onChange={(e) => {
                  const actions = node.actions.map((act, idx) =>
                    idx === i ? { ...a, variable: e.target.value } : act,
                  );
                  onChange({ ...node, actions });
                }}
              />
              <TextInput
                placeholder="valor"
                value={a.value}
                onChange={(e) => {
                  const actions = node.actions.map((act, idx) =>
                    idx === i ? { ...a, value: e.target.value } : act,
                  );
                  onChange({ ...node, actions });
                }}
              />
            </>
          ) : (
            <TextInput
              placeholder="tag"
              value={a.tag}
              onChange={(e) => {
                const actions = node.actions.map((act, idx) =>
                  idx === i ? { ...a, tag: e.target.value } : act,
                );
                onChange({ ...node, actions });
              }}
            />
          )}
          <button
            onClick={() => onChange({ ...node, actions: node.actions.filter((_, j) => j !== i) })}
            className="text-[11px] text-red-600 hover:underline"
          >
            Quitar
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          onChange({ ...node, actions: [...node.actions, { kind: "set", variable: "", value: "" }] })
        }
        className="text-xs text-brand-700 hover:underline"
      >
        + Agregar acción
      </button>
    </>
  );
}

function TerminalForm({
  node,
  onChange,
}: {
  node: HandoffNode | EndNode;
  onChange: (n: FlowNode) => void;
}) {
  return (
    <Field label="Mensaje al cliente (opcional)">
      <TextArea
        value={node.message ?? ""}
        onChange={(e) => onChange({ ...node, message: e.target.value || undefined })}
      />
    </Field>
  );
}
