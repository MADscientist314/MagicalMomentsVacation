// Saved trips and chats, as the API returns them.
import type { DeliverableKind } from "./deliverables";

export type ConversationKind = "trip" | "chat";
export type Source = { title: string; url: string };

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  details: Record<string, string>;
  pinned: boolean;
  created_at: number;
  updated_at: number;
}

export interface StoredMessage {
  id: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  created_at: number;
}

export interface DeliverableMeta {
  id: string;
  kind: DeliverableKind;
  version: number;
  created_at: number;
}

export interface ConversationWithHistory extends Conversation {
  messages: StoredMessage[];
  deliverables: DeliverableMeta[];
}

export interface DeliverableRecord extends DeliverableMeta {
  conversation_id: string;
  data: unknown;
  footer: string;
  signature: string;
}
