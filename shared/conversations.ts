// Saved trips and chats, as the API returns them.
import type { DeliverableKind } from "./deliverables";

export type ConversationKind = "trip" | "chat";
export type Source = { title: string; url: string };

/** The longest each trip detail may be (characters). */
export const TRIP_FIELD_LIMITS: Record<string, number> = {
  lastName: 80,
  destination: 60,
  dates: 200,
  party: 300,
  resort: 200,
  priorities: 4_000,
  summary: 2_000,
};

/** Starts the note the server adds when trip details are edited after planning. */
export const DETAILS_CHANGED = "Trip details changed — use these from now on:";

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
