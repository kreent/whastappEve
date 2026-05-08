"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import { NODE_TYPE_META, type FlowNode } from "@/lib/flow-types";

interface NodeData extends Record<string, unknown> {
  node: FlowNode;
}

export default function CustomNode({ data, selected, id }: NodeProps) {
  const node = (data as NodeData).node;
  const meta = NODE_TYPE_META[node.type];

  return (
    <div
      className={clsx(
        "rounded-lg border-2 shadow-sm bg-white min-w-[180px] max-w-[260px]",
        selected ? "border-brand-500 ring-2 ring-brand-200" : meta.color,
      )}
    >
      <div className="px-3 py-1.5 border-b border-current/10 flex items-center gap-2 text-xs font-semibold text-slate-700">
        <span>{meta.icon}</span>
        <span>{meta.label}</span>
        <span className="ml-auto text-[10px] text-slate-400 font-normal truncate max-w-[80px]">
          {id}
        </span>
      </div>

      <div className="px-3 py-2 text-xs text-slate-700">
        <NodeBody node={node} />
      </div>

      {node.type !== "handoff" && node.type !== "end" && renderSourceHandles(node)}
      {(node.type !== "handoff" && node.type !== "end") || node.type === "handoff" || node.type === "end" ? null : null}
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-slate-400" />
    </div>
  );
}

function NodeBody({ node }: { node: FlowNode }) {
  if (node.type === "message" || node.type === "question") {
    return <div className="line-clamp-3">{node.text}</div>;
  }
  if (node.type === "buttons") {
    return (
      <div>
        <div className="line-clamp-2 mb-1">{node.text}</div>
        {node.buttons.map((b) => (
          <div key={b.id} className="text-[11px] text-slate-500 truncate">
            • {b.title}
          </div>
        ))}
      </div>
    );
  }
  if (node.type === "list") {
    const total = node.sections.reduce((s, sec) => s + sec.rows.length, 0);
    return (
      <div>
        <div className="line-clamp-2">{node.text}</div>
        <div className="text-[11px] text-slate-500 mt-1">
          {total} {total === 1 ? "opción" : "opciones"}
        </div>
      </div>
    );
  }
  if (node.type === "condition") {
    return (
      <div>
        {node.branches.map((b, i) => (
          <div key={i} className="text-[11px] truncate">
            <span className="text-slate-500">if</span> <code>{b.variable}</code>{" "}
            <span className="text-slate-500">{b.operator}</span>
            {b.value !== undefined ? ` "${b.value}"` : ""}
          </div>
        ))}
        {node.fallback && (
          <div className="text-[11px] text-slate-400">else → fallback</div>
        )}
      </div>
    );
  }
  if (node.type === "action") {
    return (
      <div>
        {node.actions.map((a, i) => (
          <div key={i} className="text-[11px] text-slate-500">
            {a.kind === "set" ? `set ${a.variable} = "${a.value}"` : `tag: ${a.tag}`}
          </div>
        ))}
      </div>
    );
  }
  if (node.type === "handoff" || node.type === "end") {
    return <div className="line-clamp-2 italic text-slate-600">{node.message}</div>;
  }
  return null;
}

function renderSourceHandles(node: FlowNode): React.ReactNode {
  if (node.type === "message" || node.type === "question" || node.type === "action") {
    return (
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!w-2 !h-2 !bg-slate-400"
      />
    );
  }
  if (node.type === "buttons") {
    const total = node.buttons.length;
    return node.buttons.map((b, i) => (
      <Handle
        key={b.id}
        type="source"
        position={Position.Right}
        id={b.id}
        className="!w-2 !h-2 !bg-violet-500"
        style={{ top: `${((i + 1) / (total + 1)) * 100}%` }}
      />
    ));
  }
  if (node.type === "list") {
    const rows = node.sections.flatMap((s) => s.rows);
    const total = rows.length;
    return rows.map((r, i) => (
      <Handle
        key={r.id}
        type="source"
        position={Position.Right}
        id={r.id}
        className="!w-2 !h-2 !bg-fuchsia-500"
        style={{ top: `${((i + 1) / (total + 1 + 1)) * 100}%` }}
      />
    ));
  }
  if (node.type === "condition") {
    const total = node.branches.length + (node.fallback !== undefined ? 1 : 1);
    const handles: React.ReactNode[] = node.branches.map((_, i) => (
      <Handle
        key={`branch-${i}`}
        type="source"
        position={Position.Right}
        id={`branch-${i}`}
        className="!w-2 !h-2 !bg-amber-500"
        style={{ top: `${((i + 1) / (total + 1)) * 100}%` }}
      />
    ));
    handles.push(
      <Handle
        key="fallback"
        type="source"
        position={Position.Right}
        id="fallback"
        className="!w-2 !h-2 !bg-slate-400"
        style={{ top: `${((node.branches.length + 1) / (total + 1)) * 100}%` }}
      />,
    );
    return handles;
  }
  return null;
}
