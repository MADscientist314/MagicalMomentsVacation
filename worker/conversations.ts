// Saved trips and chats: /api/conversations[/:id[/plan|/messages|/deliverables]].
// The server keeps the history; the browser only ever sends the new message.
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../shared/guard";
import { TOOLS } from "../shared/tools";
import { baseParams, defaultClient, streamClaude, WEB_SEARCH, type ClaudeClient } from "./claude";
import { handleGenerateDeliverable } from "./deliverables";
import { buildChatSystem, buildSystem, buildUserMessage } from "./prompt";
import * as store from "./store";

export interface ConversationDeps {
  makeClient?: (env: Env) => ClaudeClient;
  now?: () => number;
  keepaliveMs?: number;
  waitUntil?: (work: Promise<unknown>) => void;
}

const MAX_MESSAGE = 4_000;
const MAX_HISTORY = 200_000;
const MAX_TITLE = 120;
const LOCK_MS = 10 * 60_000;
const TRIP_FIELDS: Record<string, number> = {
  lastName: 80,
  destination: 60,
  dates: 200,
  party: 300,
  resort: 200,
  priorities: 4_000,
  summary: 2_000,
};
const FIELD_LABELS: Record<string, string> = {
  lastName: "client last name",
  destination: "destination",
  dates: "dates",
  party: "who's going",
  resort: "resort or ship",
  priorities: "priorities",
  summary: "inquiry summary",
};
const BAD_REQUEST = "That request didn't make sense — try again.";
const BUSY = "Still working on the last one — give it a moment.";

const error = (message: string, status: number) => Response.json({ error: message }, { status });

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validates, guards and masks text that will be stored and sent to Claude. */
function checkText(text: string): Checked<string> {
  const sensitive = findSensitive(text);
  if (sensitive.length) return { ok: false, error: SENSITIVE_MESSAGES[sensitive[0]] };
  return { ok: true, value: maskContacts(text).text };
}

function checkDetails(raw: unknown): Checked<Record<string, string>> {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: BAD_REQUEST };
  const details: Record<string, string> = {};
  for (const [key, max] of Object.entries(TRIP_FIELDS)) {
    const value = (raw as Record<string, unknown>)[key] ?? "";
    if (typeof value !== "string" || value.length > max) return { ok: false, error: BAD_REQUEST };
    const checked = checkText(value.trim());
    if (!checked.ok) return checked;
    if (checked.value) details[key] = checked.value;
  }
  const options = TOOLS["adventure-planner"].fields.find((f) => f.id === "destination")?.options ?? [];
  if (details.destination && !options.includes(details.destination)) return { ok: false, error: BAD_REQUEST };
  if (!details.lastName) return { ok: false, error: "Add the client's last name first." };
  return { ok: true, value: details };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
}

export async function handleConversations(
  request: Request,
  env: Env,
  segments: string[],
  deps: ConversationDeps = {},
): Promise<Response> {
  const now = deps.now ?? Date.now;
  const [id, action] = segments;
  const method = request.method;

  if (!id) {
    if (method === "GET") {
      const kind = new URL(request.url).searchParams.get("kind");
      if (kind !== "trip" && kind !== "chat") return error(BAD_REQUEST, 400);
      return Response.json(await store.listConversations(env.DB, kind));
    }
    if (method === "POST") return create(request, env, now());
    return error("Not allowed.", 405);
  }

  const convo = await store.getConversation(env.DB, id);
  if (!convo) return error("That trip or chat wasn't found.", 404);

  if (!action) {
    if (method === "GET") {
      const [messages, deliverables] = await Promise.all([
        store.getMessages(env.DB, id),
        store.listDeliverables(env.DB, id),
      ]);
      return Response.json({ ...convo, messages, deliverables });
    }
    if (method === "PATCH") return update(request, env, convo, now());
    if (method === "DELETE") {
      await store.deleteConversation(env.DB, id);
      return Response.json({ ok: true });
    }
    return error("Not allowed.", 405);
  }

  if (method !== "POST") return error("Not allowed.", 405);
  if (action === "plan") return plan(env, convo, deps);
  if (action === "messages") return sendMessage(request, env, convo, deps);
  if (action === "deliverables") return handleGenerateDeliverable(request, env, convo, deps);
  return error("not found", 404);
}

async function create(request: Request, env: Env, now: number): Promise<Response> {
  const body = await readJson(request);
  if (!body) return error(BAD_REQUEST, 400);
  if (body.kind === "trip") {
    const details = checkDetails(body.details);
    if (!details.ok) return error(details.error, 400);
    const title = `${details.value.lastName} family`;
    return Response.json(await store.createConversation(env.DB, { kind: "trip", title, details: details.value }, now), {
      status: 201,
    });
  }
  if (body.kind === "chat") {
    if (typeof body.title !== "string" || !body.title.trim()) return error(BAD_REQUEST, 400);
    const title = checkText(body.title.trim().slice(0, MAX_TITLE));
    if (!title.ok) return error(title.error, 400);
    return Response.json(await store.createConversation(env.DB, { kind: "chat", title: title.value }, now), { status: 201 });
  }
  return error(BAD_REQUEST, 400);
}

async function update(request: Request, env: Env, convo: store.Conversation, now: number): Promise<Response> {
  const body = await readJson(request);
  if (!body) return error(BAD_REQUEST, 400);
  const changes: { pinned?: boolean; title?: string; details?: Record<string, string> } = {};
  if (body.pinned !== undefined) {
    if (typeof body.pinned !== "boolean") return error(BAD_REQUEST, 400);
    changes.pinned = body.pinned;
  }
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) return error(BAD_REQUEST, 400);
    const title = checkText(body.title.trim().slice(0, MAX_TITLE));
    if (!title.ok) return error(title.error, 400);
    changes.title = title.value;
  }
  if (body.details !== undefined && convo.kind === "trip") {
    const details = checkDetails(body.details);
    if (!details.ok) return error(details.error, 400);
    changes.details = details.value;
    if (details.value.lastName !== convo.details.lastName) changes.title = `${details.value.lastName} family`;
  }
  await store.updateConversation(env.DB, convo.id, changes, now);

  // Once a plan exists, tell Claude about changed details via the conversation itself.
  if (changes.details) {
    const changed = Object.keys(TRIP_FIELDS).filter((k) => (changes.details![k] ?? "") !== (convo.details[k] ?? ""));
    const history = changed.length ? await store.getMessages(env.DB, convo.id) : [];
    if (history.length) {
      const lines = changed.map((k) => `${FIELD_LABELS[k]}: ${changes.details![k] || "(cleared)"}`);
      await store.appendMessages(
        env.DB,
        convo.id,
        [
          { role: "user", content: `Trip details changed — use these from now on:\n${lines.join("\n")}` },
          { role: "assistant", content: "Got it — I'll use the updated details from here on." },
        ],
        now,
      );
    }
  }
  return Response.json(await store.getConversation(env.DB, convo.id));
}

async function plan(env: Env, convo: store.Conversation, deps: ConversationDeps): Promise<Response> {
  if (convo.kind !== "trip") return error(BAD_REQUEST, 400);
  if ((await store.getMessages(env.DB, convo.id)).length) return error("This trip is already planned.", 409);
  for (const f of TOOLS["adventure-planner"].fields) {
    if (f.required && !convo.details[f.id]) return error(`Fill in “${f.label}” first.`, 400);
  }
  const { lastName, summary } = convo.details;
  const first = [
    `**Client:** ${lastName} family`,
    buildUserMessage("adventure-planner", convo.details),
    ...(summary ? [`**From their inquiry:** ${summary}`] : []),
  ].join("\n");
  return reply(env, convo, [], first, deps);
}

async function sendMessage(
  request: Request,
  env: Env,
  convo: store.Conversation,
  deps: ConversationDeps,
): Promise<Response> {
  const body = await readJson(request);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content || content.length > MAX_MESSAGE) {
    return error(content ? "That message is too long — keep it under 4,000 characters." : BAD_REQUEST, 400);
  }
  const checked = checkText(content);
  if (!checked.ok) return error(checked.error, 400);

  const history = await store.getMessages(env.DB, convo.id);
  if (convo.kind === "trip" && !history.length) return error("Click Plan it first.", 400);
  if (history.reduce((n, m) => n + m.content.length, 0) + checked.value.length > MAX_HISTORY) {
    const what = convo.kind === "trip" ? "trip conversation is very long — start a fresh trip" : "chat has gotten long — start a new chat";
    return error(`This ${what} to keep going.`, 413);
  }
  return reply(env, convo, history, checked.value, deps);
}

/** Streams Claude's reply; saves Jillian's message and the reply together only once it's complete. */
async function reply(
  env: Env,
  convo: store.Conversation,
  history: store.StoredMessage[],
  userText: string,
  deps: ConversationDeps,
): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (!(await store.tryLock(env.DB, convo.id, now(), LOCK_MS))) return error(BUSY, 409);

  const trip = convo.kind === "trip";
  const messages: BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as BetaMessageParam),
    // Cache everything up to here, so long conversations stay cheap turn after turn.
    { role: "user", content: [{ type: "text", text: userText, cache_control: { type: "ephemeral" } }] },
  ];
  const params = baseParams({
    system: trip ? buildSystem("adventure-planner") : buildChatSystem(),
    messages,
    output_config: { effort: trip ? TOOLS["adventure-planner"].effort : "medium" },
    tools: [WEB_SEARCH],
  });
  return streamClaude(params, env, deps.makeClient ?? defaultClient, deps.keepaliveMs ?? 15_000, `${convo.kind} reply`, {
    async beforeDone({ text, sources, stopReason }) {
      if (stopReason === "refusal" || !text.trim()) return;
      await store.appendMessages(
        env.DB,
        convo.id,
        [
          { role: "user", content: userText },
          { role: "assistant", content: text, sources },
        ],
        now(),
      );
    },
    finally: () => store.releaseLock(env.DB, convo.id),
    waitUntil: deps.waitUntil,
  });
}
