// All D1 queries for saved trips, chats, messages and deliverables.
import type { DeliverableKind } from "../shared/deliverables";

export type ConversationKind = "trip" | "chat";
export type Source = { title: string; url: string };

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

export async function recordLoginFailure(db: D1Database, ip: string, now: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM login_failures WHERE at < ?").bind(now - 24 * 60 * 60_000),
    db.prepare("INSERT INTO login_failures (ip, at) VALUES (?, ?)").bind(ip, now),
  ]);
}

export async function countRecentLoginFailures(db: D1Database, ip: string, since: number): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND at >= ?").bind(ip, since).first<number>("n")) ?? 0;
}
