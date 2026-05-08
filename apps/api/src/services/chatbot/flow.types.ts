// Flow definition stored as JSON in `flows.nodes`.
//
// A flow is a finite state machine: a map of nodeId → Node, plus a `start`.
// The engine "runs" until it hits a node that needs user input
// (question / buttons / list) or a terminal node (handoff / end).

export type FlowTriggerType = "default" | "keyword" | "intent";

export interface FlowDefinition {
  start: string;
  nodes: Record<string, FlowNode>;
}

export type FlowNode =
  | MessageNode
  | QuestionNode
  | ConditionNode
  | ButtonsNode
  | ListNode
  | ActionNode
  | HandoffNode
  | EndNode;

interface BaseNode {
  id: string;
  type: FlowNode["type"];
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
