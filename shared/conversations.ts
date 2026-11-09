// Saved trips and chats, as the API returns them.
import type { Booking } from "./bookings";
import type { DeliverableKind } from "./deliverables";
import type { ShareInfo } from "./shares";

export type ConversationKind = "trip" | "chat";
export type Source = { title: string; url: string };

/** The longest one message may be (characters): room for a pasted email or a supplier's itinerary. */
export const MAX_MESSAGE = 50_000;

/** The longest each trip detail may be (characters). */
export const TRIP_FIELD_LIMITS: Record<string, number> = {
  lastName: 80,
  destination: 60,
  dates: 200,
  party: 300,
  resort: 200,
  priorities: 10_000,
  material: 50_000,
  summary: 2_000,
};

/** Starts the message that carries the quotes she gave with "Make the proposal". */
export const QUOTES_NOTE = "Quotes and prices for the proposal (from my suppliers):";

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
  /** Set once she marks the trip booked. */
  booking: Booking | null;
}

export interface DeliverableRecord extends DeliverableMeta {
  conversation_id: string;
  data: unknown;
  footer: string;
  signature: string;
  /** The family's link for this kind of document, if one is live (it may show another version). */
  share: ShareInfo | null;
}
