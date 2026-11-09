// Small fetch helpers for saved trips, chats, deliverables, drafts, images and trip files.
import type { ActiveTrip, Booking } from "../../shared/bookings";
import type { Conversation, ConversationKind, ConversationWithHistory, DeliverableRecord } from "../../shared/conversations";
import type { DeliverableData, DeliverableKind, OptionPrice } from "../../shared/deliverables";
import type { TripFile } from "../../shared/files";
import type { ShareInfo } from "../../shared/shares";
import type { SavedDraft, SavedDraftMeta } from "../../shared/drafts";
import { ownerKey, type CardKind, type ImageMeta, type ImageOwner, type Shape } from "../../shared/images";
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
/** Puts this version on the trip's link for its kind (a new link, or the same one moved here), for 30 more days. */
export const shareDeliverable = (id: string) => call<ShareInfo>(`/api/deliverables/${id}/share`, send("POST"));
export const stopSharing = (id: string) => call<{ ok: true }>(`/api/deliverables/${id}/share`, send("DELETE"));
/** One option's price breakdown, read from a quote's text (screenshots arrive already read). */
export const fillFromQuote = (text: string, option: string) =>
  call<{ price: OptionPrice; warning: string | null }>("/api/quote-lines", send("POST", { text, option }));

// Active trips: booking a trip, and its key dates. Each change answers with the trip's booking.
export const listActiveTrips = () => call<ActiveTrip[]>("/api/bookings");
export const saveBooking = (tripId: string, days: { arrival: string; departure: string | null; today: string }) =>
  call<Booking>(`/api/conversations/${tripId}/booking`, send("PUT", days));
export const unbook = (tripId: string) => call<{ ok: true }>(`/api/conversations/${tripId}/booking`, send("DELETE"));
export const addKeyDate = (tripId: string, date: { label: string; due: string }) =>
  call<Booking>(`/api/conversations/${tripId}/key-dates`, send("POST", date));
export const updateKeyDate = (tripId: string, id: string, changes: { label?: string; due?: string; done?: boolean }) =>
  call<Booking>(`/api/conversations/${tripId}/key-dates/${id}`, send("PATCH", changes));
export const deleteKeyDate = (tripId: string, id: string) => call<Booking>(`/api/conversations/${tripId}/key-dates/${id}`, send("DELETE"));

type DraftBody = Pick<SavedDraft, "request" | "content" | "sources">;
export const listDrafts = (tool: ToolId) => call<SavedDraftMeta[]>(`/api/drafts?tool=${tool}`);
export const getDraft = (id: string) => call<SavedDraft>(`/api/drafts/${id}`);
export const createDraft = (tool: ToolId, body: DraftBody) => call<SavedDraft>("/api/drafts", send("POST", { tool, ...body }));
export const updateDraft = (id: string, changes: Partial<DraftBody> & { handled?: boolean }) =>
  call<SavedDraft>(`/api/drafts/${id}`, send("PATCH", changes));
export const deleteDraft = (id: string) => call<{ ok: true }>(`/api/drafts/${id}`, send("DELETE"));

export const imageUrl = (id: string) => `/api/images/${id}`;
export const listImages = (owner: ImageOwner) => call<ImageMeta[]>(`/api/images?owner=${ownerKey(owner)}`);
export const generateImage = (body: {
  owner: ImageOwner;
  direction: string;
  shape: Shape;
  photoIds: string[];
  baseImageId?: string;
  card?: CardKind;
  /** An itinerary picture: which saved itinerary, and its cover or a day (0-based). */
  deliverableId?: string;
  slot?: "cover" | number;
}) => call<ImageMeta>("/api/images/generate", send("POST", { ...body, owner: ownerKey(body.owner) }));
export const deleteImage = (id: string) => call<{ ok: true }>(`/api/images/${id}`, send("DELETE"));

/** Sends a file as a form; `fallback` is the message when the answer has none. */
async function postForm<T>(url: string, form: FormData, fallback: string): Promise<T> {
  // No JSON content-type here: the browser sets the multipart boundary itself.
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: form });
  } catch {
    throw new ApiError("Couldn't reach the assistant — check the internet connection.", 0);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body === null) throw new ApiError(body?.error ?? fallback, res.status);
  return body;
}

async function fetchBlob(url: string, fallback: string): Promise<Blob> {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) throw new ApiError(fallback, res?.status ?? 0);
  return res.blob();
}

export async function uploadImage(owner: ImageOwner, photo: Blob): Promise<ImageMeta> {
  const form = new FormData();
  form.set("owner", ownerKey(owner));
  form.set("file", photo, "photo.jpg");
  return postForm<ImageMeta>("/api/images", form, "Couldn't add that photo — try again.");
}

/** The image's bytes, for downloading. */
export const fetchImage = (id: string) => fetchBlob(imageUrl(id), "Couldn't download that image — try again.");

// Trip files: her own records for a trip, kept in the cloud (the assistant never reads them).
/** Opens in a tab (PDFs and photos), or downloads with `download`. */
export const tripFileUrl = (tripId: string, id: string, download = false) =>
  `/api/conversations/${tripId}/files/${id}${download ? "?download" : ""}`;
export const listTripFiles = (tripId: string) => call<TripFile[]>(`/api/conversations/${tripId}/files`);
export const deleteTripFile = (tripId: string, id: string) => call<{ ok: true }>(`/api/conversations/${tripId}/files/${id}`, send("DELETE"));
export function uploadTripFile(tripId: string, file: File): Promise<TripFile> {
  const form = new FormData();
  form.set("file", file, file.name);
  return postForm<TripFile>(`/api/conversations/${tripId}/files`, form, "Couldn't add that file — try again.");
}
export const fetchTripFile = (tripId: string, id: string) => fetchBlob(tripFileUrl(tripId, id, true), "Couldn't download that file — try again.");
