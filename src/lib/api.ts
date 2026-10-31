// Small fetch helpers for saved trips, chats, deliverables and drafts.
import type { Conversation, ConversationKind, ConversationWithHistory, DeliverableRecord } from "../../shared/conversations";
import type { DeliverableData, DeliverableKind } from "../../shared/deliverables";
import type { SavedDraft, SavedDraftMeta } from "../../shared/drafts";
import type { ToolId } from "../../shared/tools";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiError("Couldn't reach the assistant — check the internet connection.", 0);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body === null) {
    const fallback =
      res.status === 401 ? "Your sign-in expired — reload the page to sign in again." : "Something went wrong — try again.";
    throw new ApiError(body?.error ?? fallback, res.status);
  }
  return body;
}

const send = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});

export const listConversations = (kind: ConversationKind) => call<Conversation[]>(`/api/conversations?kind=${kind}`);
export const getConversation = (id: string) => call<ConversationWithHistory>(`/api/conversations/${id}`);
export const createTrip = (details: Record<string, string>) =>
  call<Conversation>("/api/conversations", send("POST", { kind: "trip", details }));
export const createChat = (title: string) => call<Conversation>("/api/conversations", send("POST", { kind: "chat", title }));
export const updateConversation = (
  id: string,
  changes: { pinned?: boolean; title?: string; details?: Record<string, string> },
) => call<Conversation>(`/api/conversations/${id}`, send("PATCH", changes));
export const deleteConversation = (id: string) => call<{ ok: true }>(`/api/conversations/${id}`, send("DELETE"));
export const getDeliverable = (id: string) => call<DeliverableRecord>(`/api/deliverables/${id}`);
export const saveDeliverableEdit = (id: string, data: DeliverableData) =>
  call<{ id: string; kind: DeliverableKind; version: number }>(`/api/deliverables/${id}/edit`, send("POST", { data }));

type DraftBody = Pick<SavedDraft, "request" | "content" | "sources">;
export const listDrafts = (tool: ToolId) => call<SavedDraftMeta[]>(`/api/drafts?tool=${tool}`);
export const getDraft = (id: string) => call<SavedDraft>(`/api/drafts/${id}`);
export const createDraft = (tool: ToolId, body: DraftBody) => call<SavedDraft>("/api/drafts", send("POST", { tool, ...body }));
export const updateDraft = (id: string, changes: Partial<DraftBody> & { handled?: boolean }) =>
  call<SavedDraft>(`/api/drafts/${id}`, send("PATCH", changes));
export const deleteDraft = (id: string) => call<{ ok: true }>(`/api/drafts/${id}`, send("DELETE"));
