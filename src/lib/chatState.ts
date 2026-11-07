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
  /** A message whose reply failed, handed back to the text box. */
  restore: string | null;
  /** The send in progress: where its turns start, and the text to hand back if it fails (null for Plan it). */
  pending: { from: number; text: string | null } | null;
}

export type ChatAction =
  /** `restorable: false` for requests Jillian didn't type, like Plan it. */
  | { type: "send"; text: string; notice: string | null; restorable?: boolean }
  | { type: "text"; text: string }
  | { type: "status"; phase: "searching" | "writing" }
  | { type: "done"; stopReason: string; sources: { title: string; url: string }[] }
  | { type: "error"; message: string }
  /** Jillian pressed Stop: nothing was saved, so take the turn back like a failed reply, but calmly. */
  | { type: "stopped" }
  /** `notice` keeps a note on screen across the reload (e.g. "Stopped"). */
  | { type: "load"; turns: ChatTurn[]; notice?: string | null }
  | { type: "reset" };

export const initialChatState: ChatState = { turns: [], phase: "idle", error: null, notice: null, restore: null, pending: null };

const REFUSED = "I can't help with that one — try rewording.";
export const STOPPED = "Stopped. Nothing was saved.";
export const STOPPED_RESTORED = "Stopped. Nothing was saved, and your message is back in the box.";

const awaitingReply = (s: ChatState) => s.turns.at(-1)?.role === "user";

/** A failed reply was never saved: take back this send's turns and hand her message back. */
function giveBack(s: ChatState, error: string): ChatState {
  const from = s.pending?.from ?? (awaitingReply(s) ? s.turns.length - 1 : s.turns.length);
  return { ...s, phase: "idle", error, turns: s.turns.slice(0, from), restore: s.pending?.text ?? null, pending: null };
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case "send":
      return {
        ...s,
        phase: "waiting",
        error: null,
        notice: a.notice,
        restore: null,
        pending: { from: s.turns.length, text: a.restorable === false ? null : a.text },
        turns: [...s.turns, { role: "user", content: a.text }],
      };
    case "text": {
      if (awaitingReply(s)) return { ...s, phase: "writing", turns: [...s.turns, { role: "assistant", content: a.text }] };
      const last = s.turns.at(-1)!;
      return { ...s, phase: "writing", turns: [...s.turns.slice(0, -1), { ...last, content: last.content + a.text }] };
    }
    case "status":
      return { ...s, phase: a.phase };
    case "done": {
      if (a.stopReason === "refusal") return giveBack(s, REFUSED);
      if (awaitingReply(s)) return giveBack(s, "Something went wrong — try again.");
      const last = s.turns.at(-1)!;
      const turns = a.sources.length ? [...s.turns.slice(0, -1), { ...last, sources: a.sources }] : s.turns;
      return { ...s, phase: "idle", turns, error: null, pending: null };
    }
    case "error":
      return giveBack(s, a.message);
    case "stopped": {
      if (s.phase === "idle") return s;
      const back = giveBack(s, "");
      return { ...back, error: null, notice: back.restore ? STOPPED_RESTORED : STOPPED };
    }
    case "load":
      return { ...initialChatState, turns: a.turns, notice: a.notice ?? null };
    case "reset":
      return initialChatState;
  }
}

export function messagesForApi(turns: ChatTurn[]): ChatMessage[] {
  return turns.map(({ role, content }) => ({ role, content }));
}
