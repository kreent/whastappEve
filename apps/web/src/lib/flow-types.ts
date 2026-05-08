// Mirror of apps/api/src/services/chatbot/flow.types.ts (kept manually in sync)

export type FlowDefinition = {
  start: string;
  nodes: Record<string, FlowNode>;
};

export type FlowNode =
  | MessageNode
  | QuestionNode
  | ConditionNode
  | ButtonsNode
  | ListNode
  | ActionNode
  | HandoffNode
  | EndNode;

export type FlowNodeType = FlowNode["type"];

interface BaseNode {
  id: string;
  type: FlowNodeType;
  position?: { x: number; y: number };
}

export interface MessageNode extends BaseNode {
  type: "message";
  text: string;
  next?: string;
}

export interface QuestionNode extends BaseNode {
  type: "question";
  text: string;
  saveAs: string;
  next?: string;
}

export type ConditionOperator = "equals" | "not_equals" | "contains" | "exists" | "matches";

export interface ConditionBranch {
  variable: string;
  operator: ConditionOperator;
  value?: string;
  goto: string;
}

export interface ConditionNode extends BaseNode {
  type: "condition";
  branches: ConditionBranch[];
  fallback?: string;
}

export interface ButtonsNode extends BaseNode {
  type: "buttons";
  text: string;
  footer?: string;
  saveAs?: string;
  buttons: Array<{ id: string; title: string; goto: string }>;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
  goto: string;
}

export interface ListNode extends BaseNode {
  type: "list";
  text: string;
  footer?: string;
  buttonText: string;
  saveAs?: string;
  sections: Array<{ title?: string; rows: ListRow[] }>;
}

export type FlowAction =
  | { kind: "set"; variable: string; value: string }
  | { kind: "tag_contact"; tag: string };

export interface ActionNode extends BaseNode {
  type: "action";
  actions: FlowAction[];
  next?: string;
}

export interface HandoffNode extends BaseNode {
  type: "handoff";
  message?: string;
}

export interface EndNode extends BaseNode {
  type: "end";
  message?: string;
}

export const NODE_TYPE_META: Record<
  FlowNodeType,
  { label: string; color: string; icon: string }
> = {
  message: { label: "Mensaje", color: "bg-sky-100 border-sky-300", icon: "💬" },
  question: { label: "Pregunta", color: "bg-indigo-100 border-indigo-300", icon: "❓" },
  buttons: { label: "Botones", color: "bg-violet-100 border-violet-300", icon: "🔘" },
  list: { label: "Lista", color: "bg-fuchsia-100 border-fuchsia-300", icon: "📋" },
  condition: { label: "Condición", color: "bg-amber-100 border-amber-300", icon: "🔀" },
  action: { label: "Acción", color: "bg-emerald-100 border-emerald-300", icon: "⚙️" },
  handoff: { label: "Derivar", color: "bg-rose-100 border-rose-300", icon: "👤" },
  end: { label: "Fin", color: "bg-slate-100 border-slate-300", icon: "⏹" },
};
