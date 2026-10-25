import type { ChatMessage } from "../../shared/chat";

export interface ChatTurn extends ChatMessage {
  sources?: { title: string; url: string }[];
}

export interface ChatState {
  turns: ChatTurn[];
  phase: "idle" | "waiting" | "searching" | "writing";
  error: string | null;
  /** Shown under the box, e.g. which contact details were hidden. */
  notice: string | null;
  /** A message that failed before any reply, handed back to the text box. */
  restore: string | null;
}

export type ChatAction =
  | { type: "send"; text: string; notice: string | null }
  | { type: "text"; text: string }
  | { type: "status"; phase: "searching" | "writing" }
  | { type: "done"; stopReason: string; sources: { title: string; url: string }[] }
  | { type: "error"; message: string }
  | { type: "load"; turns: ChatTurn[] }
  | { type: "reset" };

export const initialChatState: ChatState = { turns: [], phase: "idle", error: null, notice: null, restore: null };

const REFUSED = "I can't help with that one — try rewording.";

const awaitingReply = (s: ChatState) => s.turns.at(-1)?.role === "user";

/** Takes back an unanswered message so the conversation keeps alternating. */
function giveBack(s: ChatState, error: string): ChatState {
  if (!awaitingReply(s)) return { ...s, phase: "idle", error, restore: null };
  return { ...s, phase: "idle", error, turns: s.turns.slice(0, -1), restore: s.turns.at(-1)!.content };
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case "send":
      return { ...s, phase: "waiting", error: null, notice: a.notice, restore: null, turns: [...s.turns, { role: "user", content: a.text }] };
    case "text": {
      if (awaitingReply(s)) return { ...s, phase: "writing", turns: [...s.turns, { role: "assistant", content: a.text }] };
      const last = s.turns.at(-1)!;
      return { ...s, phase: "writing", turns: [...s.turns.slice(0, -1), { ...last, content: last.content + a.text }] };
    }
    case "status":
      return { ...s, phase: a.phase };
    case "done": {
      if (awaitingReply(s)) return giveBack(s, a.stopReason === "refusal" ? REFUSED : "Something went wrong — try again.");
      const last = s.turns.at(-1)!;
      const turns = a.sources.length ? [...s.turns.slice(0, -1), { ...last, sources: a.sources }] : s.turns;
      return { ...s, phase: "idle", turns, error: a.stopReason === "refusal" ? REFUSED : null };
    }
    case "error":
      return giveBack(s, a.message);
    case "load":
      return { ...initialChatState, turns: a.turns };
    case "reset":
      return initialChatState;
  }
}

export function messagesForApi(turns: ChatTurn[]): ChatMessage[] {
  return turns.map(({ role, content }) => ({ role, content }));
}
