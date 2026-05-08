export type ConversationStatus =
  | "open"
  | "assigned"
  | "pending"
  | "resolved"
  | "bot_handling";

export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export interface Contact {
  id: string;
  phoneNumber: string;
  name: string | null;
  profileName: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  lastMessageAt: string | null;
}

export interface MessageContent {
  body?: string;
  text?: { body?: string };
  kind?: "buttons" | "list";
  buttons?: Array<{ id: string; title: string }>;
  interactive?: {
    type?: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  [key: string]: unknown;
}

export interface Message {
  id: string;
  conversationId: string;
  whatsappMessageId: string | null;
  direction: MessageDirection;
  type: string;
  content: MessageContent;
  status: MessageStatus;
  sentBy: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ConversationListItem {
  id: string;
  contactId: string;
  status: ConversationStatus;
  assignedAgentId: string | null;
  currentFlowNodeId: string | null;
  windowExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: Contact;
  messages: Message[];
  _count: { messages: number };
}

export interface Note {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; role: string };
}

export interface Flow {
  id: string;
  name: string;
}

export interface ConversationDetail extends ConversationListItem {
  messages: Message[];
  notes: Note[];
  currentFlow: Flow | null;
  windowOpen: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "agent";
}
