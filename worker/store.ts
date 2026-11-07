// All D1 queries for saved trips, chats, messages, deliverables, drafts and images.
import type { ActiveTrip, Booking, KeyDate } from "../shared/bookings";
import type { DeliverableKind } from "../shared/deliverables";
import type { TripFile } from "../shared/files";
import type { ImageMeta, ImageOwner, Shape } from "../shared/images";
import type { Conversation, ConversationKind, DeliverableMeta, Source, StoredMessage } from "../shared/conversations";
import type { SavedDraft, SavedDraftMeta } from "../shared/drafts";
import type { ToolId } from "../shared/tools";

export type { Conversation, ConversationKind, DeliverableMeta, Source, StoredMessage };

type ConversationRow = Omit<Conversation, "details" | "pinned"> & { details: string; pinned: number };

const toConversation = (r: ConversationRow): Conversation => ({
  ...r,
  details: JSON.parse(r.details),
  pinned: r.pinned === 1,
});

const COLUMNS = "id, kind, title, details, pinned, created_at, updated_at";

export async function createConversation(
  db: D1Database,
  c: { kind: ConversationKind; title: string; details?: Record<string, string> },
  now: number,
): Promise<Conversation> {
  const id = crypto.randomUUID();
  const details = c.details ?? {};
  await db
    .prepare(`INSERT INTO conversations (${COLUMNS}) VALUES (?, ?, ?, ?, 0, ?, ?)`)
    .bind(id, c.kind, c.title, JSON.stringify(details), now, now)
    .run();
  return { id, kind: c.kind, title: c.title, details, pinned: false, created_at: now, updated_at: now };
}

export async function listConversations(db: D1Database, kind: ConversationKind): Promise<Conversation[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM conversations WHERE kind = ? ORDER BY pinned DESC, updated_at DESC`)
    .bind(kind)
    .all<ConversationRow>();
  return results.map(toConversation);
}

export async function getConversation(db: D1Database, id: string): Promise<Conversation | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM conversations WHERE id = ?`).bind(id).first<ConversationRow>();
  return row ? toConversation(row) : null;
}

export async function updateConversation(
  db: D1Database,
  id: string,
  changes: { pinned?: boolean; title?: string; details?: Record<string, string> },
  now: number,
): Promise<boolean> {
  const fields: [string, unknown][] = [];
  if (changes.pinned !== undefined) fields.push(["pinned", changes.pinned ? 1 : 0]);
  if (changes.title !== undefined) fields.push(["title", changes.title]);
  if (changes.details !== undefined) fields.push(["details", JSON.stringify(changes.details)]);
  if (!fields.length) return (await getConversation(db, id)) !== null;
  // Pinning is housekeeping; it shouldn't reorder "recent" by itself.
  if (changes.title !== undefined || changes.details !== undefined) fields.push(["updated_at", now]);
  const sets = fields.map(([column]) => `${column} = ?`);
  const values = fields.map(([, value]) => value);
  const r = await db
    .prepare(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();
  return r.meta.changes > 0;
}

export async function deleteConversation(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare("DELETE FROM conversations WHERE id = ?").bind(id).run();
  return r.meta.changes > 0;
}

export async function getMessages(db: D1Database, conversationId: string): Promise<StoredMessage[]> {
  const { results } = await db
    .prepare("SELECT id, seq, role, content, sources, created_at FROM messages WHERE conversation_id = ? ORDER BY seq")
    .bind(conversationId)
    .all<Omit<StoredMessage, "sources"> & { sources: string }>();
  return results.map((m) => ({ ...m, sources: JSON.parse(m.sources) }));
}

/** Appends messages (numbered after the last one) and bumps updated_at, all or nothing. */
export async function appendMessages(
  db: D1Database,
  conversationId: string,
  messages: { role: "user" | "assistant"; content: string; sources?: Source[] }[],
  now: number,
): Promise<void> {
  const inserts = messages.map((m) =>
    db
      .prepare(
        `INSERT INTO messages (id, conversation_id, seq, role, content, sources, created_at)
         SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ? FROM messages WHERE conversation_id = ?`,
      )
      .bind(crypto.randomUUID(), conversationId, m.role, m.content, JSON.stringify(m.sources ?? []), now, conversationId),
  );
  await db.batch([
    ...inserts,
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").bind(now, conversationId),
  ]);
}

/** Claims the conversation for one reply at a time; false if another reply is still running. */
export async function tryLock(db: D1Database, id: string, now: number, ttlMs: number): Promise<boolean> {
  const r = await db
    .prepare("UPDATE conversations SET busy_until = ? WHERE id = ? AND (busy_until IS NULL OR busy_until < ?)")
    .bind(now + ttlMs, id, now)
    .run();
  return r.meta.changes > 0;
}

export async function releaseLock(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE conversations SET busy_until = NULL WHERE id = ?").bind(id).run();
}

export async function addDeliverable(
  db: D1Database,
  conversationId: string,
  kind: DeliverableKind,
  data: unknown,
  now: number,
): Promise<{ id: string; version: number }> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO deliverables (id, conversation_id, kind, version, data, created_at)
       SELECT ?, ?, ?, COALESCE(MAX(version), 0) + 1, ?, ? FROM deliverables WHERE conversation_id = ? AND kind = ?`,
    )
    .bind(id, conversationId, kind, JSON.stringify(data), now, conversationId, kind)
    .run();
  const version = await db.prepare("SELECT version FROM deliverables WHERE id = ?").bind(id).first<number>("version");
  return { id, version: version ?? 1 };
}

export async function getDeliverable(
  db: D1Database,
  id: string,
): Promise<(DeliverableMeta & { conversation_id: string; data: unknown }) | null> {
  const row = await db
    .prepare("SELECT id, conversation_id, kind, version, data, created_at FROM deliverables WHERE id = ?")
    .bind(id)
    .first<DeliverableMeta & { conversation_id: string; data: string }>();
  return row ? { ...row, data: JSON.parse(row.data) } : null;
}

export async function listDeliverables(db: D1Database, conversationId: string): Promise<DeliverableMeta[]> {
  const { results } = await db
    .prepare("SELECT id, kind, version, created_at FROM deliverables WHERE conversation_id = ? ORDER BY created_at DESC, version DESC")
    .bind(conversationId)
    .all<DeliverableMeta>();
  return results;
}

// ---------- trip files (the bytes are in R2) ----------

const FILE_COLUMNS = "id, name, mime, bytes, created_at FROM trip_files";

export async function addTripFile(
  db: D1Database,
  conversationId: string,
  f: { name: string; mime: string; bytes: number },
  now: number,
  id: string = crypto.randomUUID(),
): Promise<TripFile> {
  await db
    .prepare("INSERT INTO trip_files (id, conversation_id, name, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, conversationId, f.name, f.mime, f.bytes, now)
    .run();
  return { id, name: f.name, mime: f.mime, bytes: f.bytes, created_at: now };
}

/** Newest first. */
export async function listTripFiles(db: D1Database, conversationId: string): Promise<TripFile[]> {
  const { results } = await db
    .prepare(`SELECT ${FILE_COLUMNS} WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC`)
    .bind(conversationId)
    .all<TripFile>();
  return results;
}

export async function getTripFile(db: D1Database, conversationId: string, id: string): Promise<TripFile | null> {
  return db.prepare(`SELECT ${FILE_COLUMNS} WHERE id = ? AND conversation_id = ?`).bind(id, conversationId).first<TripFile>();
}

export async function countTripFiles(db: D1Database, conversationId: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM trip_files WHERE conversation_id = ?").bind(conversationId).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function deleteTripFile(db: D1Database, conversationId: string, id: string): Promise<void> {
  await db.prepare("DELETE FROM trip_files WHERE id = ? AND conversation_id = ?").bind(id, conversationId).run();
}

export async function tripFileIds(db: D1Database, conversationId: string): Promise<string[]> {
  const { results } = await db.prepare("SELECT id FROM trip_files WHERE conversation_id = ?").bind(conversationId).all<{ id: string }>();
  return results.map((r) => r.id);
}

// ---------- booked trips (Active trips) ----------

type KeyDateRow = { id: string; conversation_id: string; label: string; due: string; days_before: number | null; done: number };
const toKeyDate = (r: KeyDateRow): KeyDate => ({ id: r.id, label: r.label, due: r.due, daysBefore: r.days_before, done: r.done === 1 });
const KEY_DATE_COLUMNS = "id, conversation_id, label, due, days_before, done FROM key_dates";

export async function getBooking(db: D1Database, conversationId: string): Promise<Booking | null> {
  const row = await db.prepare("SELECT arrival, departure FROM bookings WHERE conversation_id = ?").bind(conversationId).first<{ arrival: string; departure: string | null }>();
  if (!row) return null;
  const { results } = await db.prepare(`SELECT ${KEY_DATE_COLUMNS} WHERE conversation_id = ? ORDER BY due, created_at`).bind(conversationId).all<KeyDateRow>();
  return { arrival: row.arrival, departure: row.departure, keyDates: results.map(toKeyDate) };
}

/** Every booked trip, soonest arrival first, each with its key dates. */
export async function listActiveTrips(db: D1Database): Promise<ActiveTrip[]> {
  const [trips, dates] = await Promise.all([
    db
      .prepare(
        "SELECT c.id, c.title, c.details, b.arrival, b.departure FROM bookings b JOIN conversations c ON c.id = b.conversation_id ORDER BY b.arrival, c.title",
      )
      .all<{ id: string; title: string; details: string; arrival: string; departure: string | null }>(),
    db.prepare(`SELECT ${KEY_DATE_COLUMNS} ORDER BY due, created_at`).all<KeyDateRow>(),
  ]);
  return trips.results.map((t) => {
    const details = JSON.parse(t.details) as Record<string, string>;
    return {
      id: t.id,
      title: t.title,
      destination: details.destination ?? "",
      resort: details.resort ?? "",
      booking: { arrival: t.arrival, departure: t.departure, keyDates: dates.results.filter((d) => d.conversation_id === t.id).map(toKeyDate) },
    };
  });
}

/**
 * Books the trip, or changes its days. The first time, it adds `reminders` counted back from arrival; after
 * that, a changed arrival moves those reminders (her own dates stay where she put them), never to before `today`.
 */
export async function saveBooking(
  db: D1Database,
  conversationId: string,
  days: { arrival: string; departure: string | null },
  reminders: { daysBefore: number; label: string; due: string }[],
  today: string,
  now: number,
): Promise<void> {
  const existing = await db.prepare("SELECT 1 AS found FROM bookings WHERE conversation_id = ?").bind(conversationId).first();
  if (existing) {
    await db.batch([
      db.prepare("UPDATE bookings SET arrival = ?, departure = ?, updated_at = ? WHERE conversation_id = ?").bind(days.arrival, days.departure, now, conversationId),
      db
        .prepare("UPDATE key_dates SET due = max(date(?, '-' || days_before || ' days'), ?) WHERE conversation_id = ? AND days_before IS NOT NULL")
        .bind(days.arrival, today, conversationId),
    ]);
    return;
  }
  await db.batch([
    db.prepare("INSERT INTO bookings (conversation_id, arrival, departure, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(conversationId, days.arrival, days.departure, now, now),
    ...reminders.map((r, i) =>
      db
        .prepare("INSERT INTO key_dates (id, conversation_id, label, due, days_before, done, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)")
        .bind(crypto.randomUUID(), conversationId, r.label, r.due, r.daysBefore, now + i),
    ),
  ]);
}

export async function deleteBooking(db: D1Database, conversationId: string): Promise<void> {
  await db.prepare("DELETE FROM bookings WHERE conversation_id = ?").bind(conversationId).run();
}

export async function addKeyDate(db: D1Database, conversationId: string, label: string, due: string, now: number): Promise<void> {
  await db
    .prepare("INSERT INTO key_dates (id, conversation_id, label, due, days_before, done, created_at) VALUES (?, ?, ?, ?, NULL, 0, ?)")
    .bind(crypto.randomUUID(), conversationId, label, due, now)
    .run();
}

/** Changes one of the trip's key dates; a new day makes it hers (it no longer moves with arrival). False if it isn't there. */
export async function updateKeyDate(
  db: D1Database,
  conversationId: string,
  id: string,
  changes: { label?: string; due?: string; done?: boolean },
): Promise<boolean> {
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (changes.label !== undefined) {
    sets.push("label = ?");
    values.push(changes.label);
  }
  if (changes.due !== undefined) {
    sets.push("due = ?", "days_before = NULL");
    values.push(changes.due);
  }
  if (changes.done !== undefined) {
    sets.push("done = ?");
    values.push(changes.done ? 1 : 0);
  }
  if (!sets.length) return !!(await db.prepare("SELECT 1 AS found FROM key_dates WHERE id = ? AND conversation_id = ?").bind(id, conversationId).first());
  const r = await db
    .prepare(`UPDATE key_dates SET ${sets.join(", ")} WHERE id = ? AND conversation_id = ?`)
    .bind(...values, id, conversationId)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function deleteKeyDate(db: D1Database, conversationId: string, id: string): Promise<boolean> {
  const r = await db.prepare("DELETE FROM key_dates WHERE id = ? AND conversation_id = ?").bind(id, conversationId).run();
  return (r.meta.changes ?? 0) > 0;
}

// ---------- share links ----------

export interface StoredShare {
  token: string;
  conversation_id: string;
  kind: DeliverableKind;
  deliverable_id: string;
  version: number;
  created_at: number;
  expires_at: number;
}

const SHARE_COLUMNS =
  "s.token, s.conversation_id, s.kind, s.deliverable_id, d.version, s.created_at, s.expires_at FROM shares s JOIN deliverables d ON d.id = s.deliverable_id";

export async function getShare(db: D1Database, token: string): Promise<StoredShare | null> {
  return db.prepare(`SELECT ${SHARE_COLUMNS} WHERE s.token = ?`).bind(token).first<StoredShare>();
}

/** The trip's link for this kind of document, if there is one (expired or not). */
export async function getShareFor(db: D1Database, conversationId: string, kind: DeliverableKind): Promise<StoredShare | null> {
  return db.prepare(`SELECT ${SHARE_COLUMNS} WHERE s.conversation_id = ? AND s.kind = ?`).bind(conversationId, kind).first<StoredShare>();
}

/** Points the trip's link for this kind at one version, for `ms` from now; a new link gets `token`. */
export async function upsertShare(
  db: D1Database,
  doc: { conversation_id: string; kind: DeliverableKind; id: string },
  token: string,
  now: number,
  ms: number,
): Promise<StoredShare> {
  await db
    .prepare(
      `INSERT INTO shares (token, conversation_id, kind, deliverable_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (conversation_id, kind) DO UPDATE SET deliverable_id = excluded.deliverable_id, expires_at = excluded.expires_at`,
    )
    .bind(token, doc.conversation_id, doc.kind, doc.id, now, now + ms)
    .run();
  return (await getShareFor(db, doc.conversation_id, doc.kind))!;
}

export async function deleteShareFor(db: D1Database, conversationId: string, kind: DeliverableKind): Promise<void> {
  await db.prepare("DELETE FROM shares WHERE conversation_id = ? AND kind = ?").bind(conversationId, kind).run();
}

// ---------- saved drafts from the one-off tools ----------

type DraftRow = Omit<SavedDraft, "request" | "sources" | "handled"> & { request: string; sources: string; handled: number };

const toDraft = (r: DraftRow): SavedDraft => ({
  ...r,
  request: JSON.parse(r.request),
  sources: JSON.parse(r.sources),
  handled: r.handled === 1,
});

export async function createDraft(
  db: D1Database,
  d: { tool: ToolId; title: string; request: SavedDraft["request"]; content: string; sources: Source[] },
  now: number,
): Promise<SavedDraft> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO drafts (id, tool, title, request, content, sources, handled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(id, d.tool, d.title, JSON.stringify(d.request), d.content, JSON.stringify(d.sources), now, now)
    .run();
  return { id, ...d, handled: false, created_at: now, updated_at: now };
}

/** Still-to-do first (only Inbox Helper marks things handled), then newest first. */
export async function listDrafts(db: D1Database, tool: ToolId): Promise<SavedDraftMeta[]> {
  const { results } = await db
    .prepare("SELECT id, tool, title, handled, created_at, updated_at FROM drafts WHERE tool = ? ORDER BY handled, updated_at DESC")
    .bind(tool)
    .all<Omit<SavedDraftMeta, "handled"> & { handled: number }>();
  return results.map((r) => ({ ...r, handled: r.handled === 1 }));
}

export async function getDraft(db: D1Database, id: string): Promise<SavedDraft | null> {
  const row = await db.prepare("SELECT * FROM drafts WHERE id = ?").bind(id).first<DraftRow>();
  return row ? toDraft(row) : null;
}

export async function updateDraft(
  db: D1Database,
  id: string,
  changes: { title?: string; request?: SavedDraft["request"]; content?: string; sources?: Source[]; handled?: boolean },
  now: number,
): Promise<boolean> {
  const fields: [string, unknown][] = [];
  if (changes.title !== undefined) fields.push(["title", changes.title]);
  if (changes.request !== undefined) fields.push(["request", JSON.stringify(changes.request)]);
  if (changes.content !== undefined) fields.push(["content", changes.content]);
  if (changes.sources !== undefined) fields.push(["sources", JSON.stringify(changes.sources)]);
  if (changes.handled !== undefined) fields.push(["handled", changes.handled ? 1 : 0]);
  if (!fields.length) return (await getDraft(db, id)) !== null;
  // Ticking "handled" is housekeeping; it shouldn't reorder the list by itself.
  if (changes.content !== undefined || changes.request !== undefined) fields.push(["updated_at", now]);
  const r = await db
    .prepare(`UPDATE drafts SET ${fields.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`)
    .bind(...fields.map(([, value]) => value), id)
    .run();
  return r.meta.changes > 0;
}

export async function deleteDraft(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare("DELETE FROM drafts WHERE id = ?").bind(id).run();
  return r.meta.changes > 0;
}

// ---------- images (the bytes live in R2; these are the facts about each one) ----------

export type StoredImage = ImageMeta & { mime: string; draft_id: string | null; conversation_id: string | null };

const IMAGE_COLUMNS = "id, kind, shape, prompt, created_at";

/** The WHERE clause for one owner's images; library images belong to neither a post nor a trip. */
function ownerWhere(owner: ImageOwner): { sql: string; values: string[] } {
  if (owner.type === "library") return { sql: "draft_id IS NULL AND conversation_id IS NULL", values: [] };
  return { sql: `${owner.type === "draft" ? "draft_id" : "conversation_id"} = ?`, values: [owner.id] };
}

export function ownsImage(owner: ImageOwner, image: StoredImage): boolean {
  if (owner.type === "library") return image.draft_id === null && image.conversation_id === null;
  return (owner.type === "draft" ? image.draft_id : image.conversation_id) === owner.id;
}

export async function addImage(
  db: D1Database,
  i: {
    owner: ImageOwner;
    kind: ImageMeta["kind"];
    mime: string;
    bytes: number;
    shape: Shape | null;
    prompt: string;
    model: string | null;
    cost_usd: number;
    /** 'document' pictures go in client documents and stay out of the galleries. */
    purpose?: "gallery" | "document";
  },
  now: number,
  id: string = crypto.randomUUID(),
): Promise<ImageMeta> {
  const draftId = i.owner.type === "draft" ? i.owner.id : null;
  const conversationId = i.owner.type === "trip" ? i.owner.id : null;
  await db
    .prepare(
      `INSERT INTO images (id, draft_id, conversation_id, kind, mime, bytes, shape, prompt, model, cost_usd, purpose, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, draftId, conversationId, i.kind, i.mime, i.bytes, i.shape, i.prompt, i.model, i.cost_usd, i.purpose ?? "gallery", now)
    .run();
  return { id, kind: i.kind, shape: i.shape, prompt: i.prompt, created_at: now };
}

/** A gallery's images, newest first (itinerary pictures aren't listed; their documents point at them). */
export async function listImages(db: D1Database, owner: ImageOwner): Promise<ImageMeta[]> {
  const where = ownerWhere(owner);
  const { results } = await db
    .prepare(`SELECT ${IMAGE_COLUMNS} FROM images WHERE ${where.sql} AND purpose = 'gallery' ORDER BY created_at DESC, rowid DESC`)
    .bind(...where.values)
    .all<ImageMeta>();
  return results;
}

export async function getImage(db: D1Database, id: string): Promise<StoredImage | null> {
  return db
    .prepare(`SELECT ${IMAGE_COLUMNS}, mime, draft_id, conversation_id FROM images WHERE id = ?`)
    .bind(id)
    .first<StoredImage>();
}

export async function deleteImage(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM images WHERE id = ?").bind(id).run();
}

export async function imageIdsOf(db: D1Database, owner: ImageOwner): Promise<string[]> {
  const where = ownerWhere(owner);
  const { results } = await db
    .prepare(`SELECT id FROM images WHERE ${where.sql}`)
    .bind(...where.values)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

export async function countGeneratedSince(db: D1Database, since: number): Promise<number> {
  const n = await db
    .prepare("SELECT COUNT(*) AS n FROM images WHERE kind = 'generated' AND created_at >= ?")
    .bind(since)
    .first<number>("n");
  return Number(n ?? 0);
}

/**
 * Records a sign-in attempt and counts this address's attempts since `since`, in one batch,
 * so guesses sent all at once can't all see a low count. A successful sign-in is forgotten again.
 */
export async function recordLoginAttempt(db: D1Database, ip: string, now: number, since: number): Promise<{ id: number; count: number }> {
  const [, inserted, counted] = await db.batch([
    db.prepare("DELETE FROM login_failures WHERE at < ?").bind(now - 24 * 60 * 60_000),
    db.prepare("INSERT INTO login_failures (ip, at) VALUES (?, ?)").bind(ip, now),
    db.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND at >= ?").bind(ip, since),
  ]);
  return { id: Number(inserted.meta.last_row_id), count: Number((counted.results[0] as { n: number }).n) };
}

export async function forgetLoginAttempt(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM login_failures WHERE rowid = ?").bind(id).run();
}
