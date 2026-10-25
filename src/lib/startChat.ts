import { findSensitive, SENSITIVE_MESSAGES } from "../../shared/guard";
import { createChat } from "./api";
import { sendToThread } from "./threadStore";

/** Starts a saved "Make a wish" chat with its first message; returns the new id, or a message to show. */
export async function startChat(text: string): Promise<{ id: string } | { error: string }> {
  const hits = findSensitive(text);
  if (hits.length) return { error: SENSITIVE_MESSAGES[hits[0]] };
  try {
    const chat = await createChat(text.trim().slice(0, 60));
    const problem = sendToThread(chat.id, text);
    return problem ? { error: problem } : { id: chat.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
