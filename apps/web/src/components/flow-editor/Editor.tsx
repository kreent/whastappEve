"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { FlowDefinition, FlowNode, FlowNodeType } from "@/lib/flow-types";
import CustomNode from "./CustomNode";
import Inspector from "./Inspector";
import Palette from "./Palette";
import { blankNode, definitionToFlow, flowToDefinition, type RFNode } from "./convert";

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerValue: string | null;
  priority: number;
  isActive: boolean;
  definition: FlowDefinition;
}

interface Props {
  flowId: string;
}

export default function Editor({ flowId }: Props) {
  return (
    <ReactFlowProvider>
      <EditorInner flowId={flowId} />
    </ReactFlowProvider>
  );
}

function EditorInner({ flowId }: Props) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reactFlow = useReactFlow();
  const [flow, setFlow] = useState<FlowRow | null>(null);
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [start, setStart] = useState<string>("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nodeTypes = useMemo(
    () => ({
      message: CustomNode,
      question: CustomNode,
      buttons: CustomNode,
      list: CustomNode,
      condition: CustomNode,
      action: CustomNode,
      handoff: CustomNode,
      end: CustomNode,
    }),
    [],
  );

  useEffect(() => {
    api<FlowRow>(`/api/flows/${flowId}`).then((f) => {
      setFlow(f);
      setName(f.name);
      setIsActive(f.isActive);
      setStart(f.definition.start);
      const { nodes: n, edges: e } = definitionToFlow(f.definition);
      setNodes(n);
      setEdges(e);
    });
  }, [flowId]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as RFNode[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback((conn: Connection) => {
    const id = `${conn.source}-${conn.sourceHandle ?? "next"}-${conn.target}`;
    setEdges((eds) =>
      addEdge({ ...conn, id, type: "smoothstep" }, eds),
    );
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/wa-node-type") as FlowNodeType;
      if (!type) return;
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const id = generateNodeId(type, nodes.map((n) => n.id));
      const node = blankNode(type, id);
      const rfNode: RFNode = {
        id,
        type,
        position,
        data: { node },
      };
      setNodes((ns) => [...ns, rfNode]);
      setSelectedId(id);
    },
    [reactFlow, nodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedId)?.data.node ?? null;

  function patchSelected(updated: FlowNode) {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== selectedId) return n;
        const newId = updated.id;
        return { ...n, id: newId, type: updated.type, data: { node: updated } };
      }),
    );
    if (updated.id !== selectedId) {
      // also update edges to use new id
      setEdges((es) =>
        es.map((e) => ({
          ...e,
          source: e.source === selectedId ? updated.id : e.source,
          target: e.target === selectedId ? updated.id : e.target,
        })),
      );
      if (start === selectedId) setStart(updated.id);
      setSelectedId(updated.id);
    }
  }

  function deleteSelected() {
    if (!selectedId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }

  function makeStart() {
    if (selectedId) setStart(selectedId);
  }

  async function save() {
    if (!flow) return;
    if (!nodes.find((n) => n.id === start)) {
      setError("El nodo inicial no existe. Selecciona uno y márcalo como inicial.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const definition = flowToDefinition(nodes, edges, start);
      await api(`/api/flows/${flowId}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          isActive,
          definition,
        }),
      });
      router.push("/flows");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!flow) {
    return <div className="p-6 text-sm text-slate-400">Cargando flujo...</div>;
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center gap-3">
        <Link href="/flows" className="text-xs text-slate-500 hover:text-slate-900">
          ← Volver
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-sm font-semibold text-slate-900 bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none"
        />
        <label className="text-xs text-slate-600 flex items-center gap-1">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Activo
        </label>
        <span className="text-[11px] text-slate-400">
          Inicial: <code className="bg-slate-100 px-1">{start || "—"}</code>
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="text-xs bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Palette />
        <div
          ref={wrapperRef}
          className="flex-1 relative"
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <ReactFlow
            nodes={nodes.map((n) => ({
              ...n,
              selected: n.id === selectedId,
              className: n.id === start ? "is-start" : undefined,
            }))}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#e2e8f0" gap={20} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          <style>{`
            .react-flow__node.is-start { box-shadow: 0 0 0 3px #16a34a; border-radius: 12px; }
          `}</style>
        </div>
        <Inspector
          node={selectedNode}
          isStart={selectedNode?.id === start}
          onChange={patchSelected}
          onDelete={deleteSelected}
          onMakeStart={makeStart}
        />
      </div>
    </div>
  );
}

function generateNodeId(type: FlowNodeType, existing: string[]): string {
  let i = 1;
  while (existing.includes(`${type}_${i}`)) i++;
  return `${type}_${i}`;
}
