// Conversation threads (trips and chats), kept outside any one page so a reply
// keeps streaming if Jillian hops to another screen. The server is the source of
// truth: after each reply the thread reloads what was actually saved.
import { useSyncExternalStore } from "react";
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../../shared/guard";
import type { StoredMessage } from "../../shared/conversations";
import { getConversation } from "./api";
import { chatReducer, initialChatState, type ChatAction, type ChatState, type ChatTurn } from "./chatState";
import { maskedNotice } from "./maskedNotice";
import { streamPost } from "./streamDraft";

interface Thread {
  state: ChatState;
  listeners: Set<() => void>;
}

const threads = new Map<string, Thread>();
/** The reply running in each thread, so Stop can cancel it. */
const running = new Map<string, AbortController>();

function thread(id: string): Thread {
  let t = threads.get(id);
  if (!t) {
    t = { state: initialChatState, listeners: new Set() };
    threads.set(id, t);
  }
  return t;
}

function dispatch(id: string, action: ChatAction) {
  const t = thread(id);
  t.state = chatReducer(t.state, action);
  for (const listener of t.listeners) listener();
}

export function useThread(id: string): ChatState {
  return useSyncExternalStore(
    (listener) => {
      const t = thread(id);
      t.listeners.add(listener);
      return () => t.listeners.delete(listener);
    },
    () => thread(id).state,
  );
}

export const toTurns = (messages: StoredMessage[]): ChatTurn[] =>
  messages.map((m) => ({ role: m.role, content: m.content, sources: m.sources }));

/** Shows the saved history, unless a reply is still streaming into this thread. */
export function loadThread(id: string, messages: StoredMessage[]) {
  if (thread(id).state.phase === "idle") dispatch(id, { type: "load", turns: toTurns(messages) });
}

export const threadBusy = (id: string) => thread(id).state.phase !== "idle";

async function reload(id: string, after?: () => void, keepNotice = false) {
  try {
    const convo = await getConversation(id);
    // If she has already sent another message, don't wipe it with this older snapshot.
    const t = thread(id);
    if (t.state.phase === "idle") dispatch(id, { type: "load", turns: toTurns(convo.messages), notice: keepNotice ? t.state.notice : null });
  } catch {
    // Keep what's on screen; the next visit reloads it.
  }
  after?.();
}

/** Starts the trip plan (the server writes the first message from the trip details). */
export function planTrip(id: string, after?: () => void) {
  if (threadBusy(id)) return;
  dispatch(id, { type: "send", text: "Plan this trip, please.", notice: null, restorable: false });
  run(id, `/api/conversations/${id}/plan`, {}, after);
}

/** Sends Jillian's message; returns a message to show instead if it can't be sent. */
export function sendToThread(id: string, text: string, after?: () => void): string | null {
  if (!text.trim() || threadBusy(id)) return null;
  const hits = findSensitive(text);
  if (hits.length) return SENSITIVE_MESSAGES[hits[0]];
  const masked = maskContacts(text.trim());
  dispatch(id, { type: "send", text: masked.text, notice: maskedNotice(masked.emails, masked.phones) });
  run(id, `/api/conversations/${id}/messages`, { content: masked.text }, after);
  return null;
}

/**
 * Stops the reply in progress. The server notices the browser has gone, stops Claude and saves
 * nothing (her message included), so the turn is taken back and her words go back in the box.
 */
export function stopThread(id: string, after?: () => void) {
  const controller = running.get(id);
  if (!controller || !threadBusy(id)) return;
  controller.abort();
  running.delete(id);
  dispatch(id, { type: "stopped" });
  // In case the reply had just finished and was saved anyway, show what the server has.
  setTimeout(() => void reload(id, after, true), 3_000);
}

function run(id: string, url: string, body: unknown, after?: () => void) {
  const controller = new AbortController();
  running.set(id, controller);
  // After Stop, ignore anything still on its way from the cancelled reply.
  const live = (fn: () => void) => () => {
    if (!controller.signal.aborted) fn();
  };
  void streamPost(
    url,
    body,
    {
      text: (t) => live(() => dispatch(id, { type: "text", text: t }))(),
      status: (phase) => live(() => dispatch(id, { type: "status", phase }))(),
      done: (d) =>
        live(() => {
          dispatch(id, { type: "done", ...d });
          void reload(id, after);
        })(),
      error: (message) => live(() => dispatch(id, { type: "error", message }))(),
    },
    controller.signal,
  ).finally(() => {
    if (running.get(id) === controller) running.delete(id);
  });
}
