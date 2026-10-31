// Saved drafts from the one-off tools: /api/drafts[/:id]. The browser saves a draft when it
// finishes and updates it after each refine; everything is guarded and masked before storing.
import type { Source } from "../shared/conversations";
import { draftTitle, SAVES_DRAFTS, type SavedDraft } from "../shared/drafts";
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../shared/guard";
import { isToolId, TOOLS, type ToolId } from "../shared/tools";
import { deleteImagesOf } from "./images";
import * as store from "./store";

const MAX_CONTENT = 100_000;
const MAX_REFINEMENTS = 20;
const MAX_REQUEST = 2_000;
const MAX_SOURCES = 100;
const BAD_REQUEST = "That request didn't make sense — try again.";

const error = (message: string, status: number) => Response.json({ error: message }, { status });

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

function guard(text: string): Checked<string> {
  const sensitive = findSensitive(text);
  if (sensitive.length) return { ok: false, error: SENSITIVE_MESSAGES[sensitive[0]] };
  return { ok: true, value: maskContacts(text).text };
}

function checkRequest(tool: ToolId, raw: unknown): Checked<SavedDraft["request"]> {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: BAD_REQUEST };
  const { fields, refinements } = raw as Record<string, unknown>;
  if (typeof fields !== "object" || fields === null) return { ok: false, error: BAD_REQUEST };
  const out: SavedDraft["request"] = { fields: {} };
  for (const f of TOOLS[tool].fields) {
    const value = (fields as Record<string, unknown>)[f.id];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || value.length > f.maxLength) return { ok: false, error: BAD_REQUEST };
    const checked = guard(value);
    if (!checked.ok) return checked;
    out.fields[f.id] = checked.value;
  }
  if (refinements !== undefined) {
    if (!Array.isArray(refinements) || refinements.length > MAX_REFINEMENTS) return { ok: false, error: BAD_REQUEST };
    out.refinements = [];
    for (const r of refinements) {
      const { draft, request } = (r ?? {}) as Record<string, unknown>;
      if (typeof draft !== "string" || typeof request !== "string") return { ok: false, error: BAD_REQUEST };
      if (draft.length > MAX_CONTENT || request.length > MAX_REQUEST) return { ok: false, error: BAD_REQUEST };
      const d = guard(draft);
      const q = guard(request);
      if (!d.ok) return d;
      if (!q.ok) return q;
      out.refinements.push({ draft: d.value, request: q.value });
    }
  }
  return { ok: true, value: out };
}

function checkContent(raw: unknown): Checked<string> {
  if (typeof raw !== "string" || !raw.trim() || raw.length > MAX_CONTENT) return { ok: false, error: BAD_REQUEST };
  return guard(raw);
}

function checkSources(raw: unknown): Checked<Source[]> {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw) || raw.length > MAX_SOURCES) return { ok: false, error: BAD_REQUEST };
  const sources: Source[] = [];
  for (const s of raw) {
    const { title, url } = (s ?? {}) as Record<string, unknown>;
    if (typeof title !== "string" || typeof url !== "string" || title.length > 500 || url.length > 2_000) {
      return { ok: false, error: BAD_REQUEST };
    }
    if (/^https?:\/\//i.test(url)) sources.push({ title, url });
  }
  return { ok: true, value: sources };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
}

export async function handleDrafts(request: Request, env: Env, segments: string[], now = Date.now): Promise<Response> {
  const [id] = segments;
  const method = request.method;

  if (!id) {
    if (method === "GET") {
      const tool = new URL(request.url).searchParams.get("tool");
      if (!isToolId(tool) || !SAVES_DRAFTS(tool)) return error(BAD_REQUEST, 400);
      return Response.json(await store.listDrafts(env.DB, tool));
    }
    if (method === "POST") return create(request, env, now());
    return error("Not allowed.", 405);
  }

  const draft = await store.getDraft(env.DB, id);
  if (!draft) return error("That saved draft wasn't found.", 404);
  if (method === "GET") return Response.json(draft);
  if (method === "PATCH") return update(request, env, draft, now());
  if (method === "DELETE") {
    await deleteImagesOf(env, { type: "draft", id }, () => store.deleteDraft(env.DB, id));
    return Response.json({ ok: true });
  }
  return error("Not allowed.", 405);
}

async function create(request: Request, env: Env, now: number): Promise<Response> {
  const body = await readJson(request);
  if (!body || !isToolId(body.tool) || !SAVES_DRAFTS(body.tool)) return error(BAD_REQUEST, 400);
  const tool = body.tool;
  const req = checkRequest(tool, body.request);
  if (!req.ok) return error(req.error, 400);
  const content = checkContent(body.content);
  if (!content.ok) return error(content.error, 400);
  const sources = checkSources(body.sources);
  if (!sources.ok) return error(sources.error, 400);
  const title = draftTitle(tool, req.value.fields, content.value);
  const saved = await store.createDraft(env.DB, { tool, title, request: req.value, content: content.value, sources: sources.value }, now);
  return Response.json(saved, { status: 201 });
}

async function update(request: Request, env: Env, draft: SavedDraft, now: number): Promise<Response> {
  const body = await readJson(request);
  if (!body) return error(BAD_REQUEST, 400);
  const changes: Parameters<typeof store.updateDraft>[2] = {};
  if (body.request !== undefined) {
    const req = checkRequest(draft.tool, body.request);
    if (!req.ok) return error(req.error, 400);
    changes.request = req.value;
  }
  if (body.content !== undefined) {
    const content = checkContent(body.content);
    if (!content.ok) return error(content.error, 400);
    changes.content = content.value;
  }
  if (body.sources !== undefined) {
    const sources = checkSources(body.sources);
    if (!sources.ok) return error(sources.error, 400);
    changes.sources = sources.value;
  }
  if (body.handled !== undefined) {
    if (typeof body.handled !== "boolean") return error(BAD_REQUEST, 400);
    changes.handled = body.handled;
  }
  if (changes.content !== undefined || changes.request !== undefined) {
    changes.title = draftTitle(draft.tool, (changes.request ?? draft.request).fields, changes.content ?? draft.content);
  }
  await store.updateDraft(env.DB, draft.id, changes, now);
  return Response.json(await store.getDraft(env.DB, draft.id));
}
