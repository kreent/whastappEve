"use client";

import { NODE_TYPE_META, type FlowNodeType } from "@/lib/flow-types";

const TYPES: FlowNodeType[] = [
  "message",
  "question",
  "buttons",
  "list",
  "condition",
  "action",
  "handoff",
  "end",
];

export default function Palette() {
  return (
    <div className="p-3 border-r border-slate-200 bg-slate-50 w-44 overflow-y-auto">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">
        Arrastrar
      </div>
      <div className="space-y-1.5">
        {TYPES.map((t) => {
          const meta = NODE_TYPE_META[t];
          return (
            <div
              key={t}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/wa-node-type", t);
                e.dataTransfer.effectAllowed = "move";
              }}
              className={`cursor-grab active:cursor-grabbing border ${meta.color} rounded-md px-2 py-1.5 text-xs flex items-center gap-2`}
            >
              <span>{meta.icon}</span>
              <span className="font-medium">{meta.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-[11px] text-slate-400 leading-relaxed">
        Tip: arrastra al canvas. Click un nodo para editarlo. Conecta nodos arrastrando desde un punto.
      </div>
    </div>
  );
}
