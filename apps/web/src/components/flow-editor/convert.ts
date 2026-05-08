import type { Edge, Node } from "@xyflow/react";
import type {
  FlowDefinition,
  FlowNode,
  FlowNodeType,
} from "@/lib/flow-types";

export type RFNode = Node<{ node: FlowNode }>;

const STEP_X = 280;
const STEP_Y = 130;

/**
 * Converts a FlowDefinition into React Flow nodes + edges.
 * If a node lacks a position, it is laid out via BFS from `start`.
 */
export function definitionToFlow(def: FlowDefinition): {
  nodes: RFNode[];
  edges: Edge[];
} {
  const positions = autoLayout(def);
  const nodes: RFNode[] = Object.values(def.nodes).map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position ?? positions[n.id] ?? { x: 0, y: 0 },
    data: { node: n },
  }));

  const edges: Edge[] = [];
  for (const n of Object.values(def.nodes)) {
    edges.push(...edgesFromNode(n));
  }
  return { nodes, edges };
}

export function flowToDefinition(
  rfNodes: RFNode[],
  rfEdges: Edge[],
  start: string,
): FlowDefinition {
  const nodes: Record<string, FlowNode> = {};
  for (const rf of rfNodes) {
    const node: FlowNode = {
      ...(rf.data.node as FlowNode),
      position: rf.position,
    };
    // Reset connection-related fields; they'll be filled from edges.
    if (node.type === "message" || node.type === "question" || node.type === "action") {
      node.next = undefined;
    } else if (node.type === "buttons") {
      node.buttons = node.buttons.map((b) => ({ ...b, goto: "" }));
    } else if (node.type === "list") {
      node.sections = node.sections.map((s) => ({
        ...s,
        rows: s.rows.map((r) => ({ ...r, goto: "" })),
      }));
    } else if (node.type === "condition") {
      node.branches = node.branches.map((b) => ({ ...b, goto: "" }));
      node.fallback = undefined;
    }
    nodes[rf.id] = node;
  }

  for (const e of rfEdges) {
    const target = e.target;
    const source = e.source;
    const handle = e.sourceHandle ?? "next";
    const node = nodes[source];
    if (!node) continue;

    if (node.type === "message" || node.type === "question" || node.type === "action") {
      node.next = target;
    } else if (node.type === "buttons") {
      node.buttons = node.buttons.map((b) =>
        b.id === handle ? { ...b, goto: target } : b,
      );
    } else if (node.type === "list") {
      node.sections = node.sections.map((s) => ({
        ...s,
        rows: s.rows.map((r) => (r.id === handle ? { ...r, goto: target } : r)),
      }));
    } else if (node.type === "condition") {
      if (handle === "fallback") {
        node.fallback = target;
      } else if (handle.startsWith("branch-")) {
        const idx = Number(handle.slice("branch-".length));
        node.branches = node.branches.map((b, i) =>
          i === idx ? { ...b, goto: target } : b,
        );
      }
    }
  }

  return { start, nodes };
}

function edgesFromNode(node: FlowNode): Edge[] {
  const out: Edge[] = [];
  if (node.type === "message" || node.type === "question" || node.type === "action") {
    if (node.next) {
      out.push(edge(node.id, node.next, "next"));
    }
  } else if (node.type === "buttons") {
    for (const b of node.buttons) {
      if (b.goto) out.push(edge(node.id, b.goto, b.id, b.title));
    }
  } else if (node.type === "list") {
    for (const s of node.sections) {
      for (const r of s.rows) {
        if (r.goto) out.push(edge(node.id, r.goto, r.id, r.title));
      }
    }
  } else if (node.type === "condition") {
    node.branches.forEach((b, i) => {
      if (b.goto) {
        out.push(edge(node.id, b.goto, `branch-${i}`, branchLabel(b)));
      }
    });
    if (node.fallback) {
      out.push(edge(node.id, node.fallback, "fallback", "else"));
    }
  }
  return out;
}

function edge(source: string, target: string, handle: string, label?: string): Edge {
  return {
    id: `${source}-${handle}-${target}`,
    source,
    target,
    sourceHandle: handle,
    label,
    type: "smoothstep",
    animated: false,
  };
}

function branchLabel(b: { variable: string; operator: string; value?: string }): string {
  return `${b.variable} ${b.operator}${b.value ? ` ${b.value}` : ""}`;
}

function autoLayout(def: FlowDefinition): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: def.start, depth: 0 }];
  const perDepth: Record<number, number> = {};

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const idx = perDepth[depth] ?? 0;
    perDepth[depth] = idx + 1;
    positions[id] = { x: depth * STEP_X, y: idx * STEP_Y };

    const next = def.nodes[id];
    if (!next) continue;
    for (const child of childIds(next)) {
      if (!visited.has(child) && def.nodes[child]) {
        queue.push({ id: child, depth: depth + 1 });
      }
    }
  }

  // any orphan nodes (not reachable from start) — pile them below
  let orphanY = (Math.max(...Object.values(perDepth), 0) + 1) * STEP_Y;
  for (const id of Object.keys(def.nodes)) {
    if (!positions[id]) {
      positions[id] = { x: 0, y: orphanY };
      orphanY += STEP_Y;
    }
  }
  return positions;
}

function childIds(node: FlowNode): string[] {
  if (node.type === "message" || node.type === "question" || node.type === "action") {
    return node.next ? [node.next] : [];
  }
  if (node.type === "buttons") return node.buttons.map((b) => b.goto).filter(Boolean);
  if (node.type === "list")
    return node.sections.flatMap((s) => s.rows.map((r) => r.goto)).filter(Boolean);
  if (node.type === "condition") {
    const ids = node.branches.map((b) => b.goto).filter(Boolean);
    if (node.fallback) ids.push(node.fallback);
    return ids;
  }
  return [];
}

export function blankNode(type: FlowNodeType, id: string): FlowNode {
  switch (type) {
    case "message":
      return { id, type, text: "Escribe el mensaje aquí" };
    case "question":
      return { id, type, text: "Pregunta al usuario", saveAs: "respuesta" };
    case "buttons":
      return {
        id,
        type,
        text: "Elige una opción",
        buttons: [
          { id: "opt_1", title: "Opción 1", goto: "" },
          { id: "opt_2", title: "Opción 2", goto: "" },
        ],
      };
    case "list":
      return {
        id,
        type,
        text: "Selecciona del menú",
        buttonText: "Ver opciones",
        sections: [
          {
            title: "Sección",
            rows: [{ id: "row_1", title: "Opción 1", goto: "" }],
          },
        ],
      };
    case "condition":
      return {
        id,
        type,
        branches: [{ variable: "respuesta", operator: "equals", value: "", goto: "" }],
      };
    case "action":
      return { id, type, actions: [{ kind: "set", variable: "var", value: "" }] };
    case "handoff":
      return { id, type, message: "Te conecto con un asesor." };
    case "end":
      return { id, type, message: "¡Listo!" };
  }
}
