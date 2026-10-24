// The chat lives outside any one page, so Jillian can hop to a tool and come back
// to the same conversation. Nothing is saved: closing the tab starts fresh.
import { useSyncExternalStore } from "react";
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../../shared/guard";
import { chatReducer, initialChatState, messagesForApi, type ChatAction, type ChatState } from "./chatState";
import { maskedNotice } from "./maskedNotice";
import { streamChat } from "./streamDraft";

let state: ChatState = initialChatState;
const listeners = new Set<() => void>();
let controller: AbortController | null = null;

function dispatch(action: ChatAction) {
  state = chatReducer(state, action);
  for (const l of listeners) l();
}

export const chatStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => state,

  /** Sends a message; returns a message to show instead if it can't be sent. */
  send(text: string): string | null {
    if (!text.trim() || state.phase !== "idle") return null;
    const hits = findSensitive(text);
    if (hits.length) return SENSITIVE_MESSAGES[hits[0]];
    const masked = maskContacts(text.trim());
    dispatch({ type: "send", text: masked.text, notice: maskedNotice(masked.emails, masked.phones) });
    controller = new AbortController();
    void streamChat(
      { messages: messagesForApi(state.turns) },
      {
        text: (t) => dispatch({ type: "text", text: t }),
        status: (phase) => dispatch({ type: "status", phase }),
        done: (d) => dispatch({ type: "done", ...d }),
        error: (message) => dispatch({ type: "error", message }),
      },
      controller.signal,
    );
    return null;
  },

  reset() {
    controller?.abort();
    dispatch({ type: "reset" });
  },
};

export function useChat(): ChatState {
  return useSyncExternalStore(chatStore.subscribe, chatStore.get);
}
