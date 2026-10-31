import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../shared/guard";
import { isToolId, TOOLS, type DraftRequest } from "../shared/tools";
import { baseParams, defaultClient, streamClaude, TRIP_WEB_SEARCH, WEB_SEARCH, type ClaudeClient } from "./claude";
import { buildSystem, buildUserMessage } from "./prompt";

export type { ClaudeClient as DraftClient } from "./claude";

const MAX_REFINEMENTS = 5;
const MAX_TOTAL_CHARS = 60_000;
const MAX_REFINE_REQUEST = 2_000;

type Validated = { ok: true; req: DraftRequest } | { ok: false; status: number; error: string };

const BAD_REQUEST = "That request didn't make sense — try again.";

function validate(body: unknown): Validated {
  if (typeof body !== "object" || body === null) return { ok: false, status: 400, error: BAD_REQUEST };
  const { tool, fields, refinements = [] } = body as Record<string, unknown>;
  if (!isToolId(tool)) return { ok: false, status: 400, error: "Unknown tool." };
  if (typeof fields !== "object" || fields === null) return { ok: false, status: 400, error: BAD_REQUEST };
  if (!Array.isArray(refinements)) return { ok: false, status: 400, error: BAD_REQUEST };

  const clean: Record<string, string> = {};
  for (const f of TOOLS[tool].fields) {
    const value = (fields as Record<string, unknown>)[f.id] ?? "";
    if (typeof value !== "string") return { ok: false, status: 400, error: BAD_REQUEST };
    if (f.required && !value.trim()) return { ok: false, status: 400, error: `Fill in “${f.label}” first.` };
    if (value.length > f.maxLength) {
      return { ok: false, status: 400, error: `“${f.label}” is too long — keep it under ${f.maxLength} characters.` };
    }
    if (f.options && value && !f.options.includes(value)) return { ok: false, status: 400, error: BAD_REQUEST };
    clean[f.id] = value;
  }

  if (refinements.length > MAX_REFINEMENTS) {
    return { ok: false, status: 413, error: "This draft has been refined a lot — start over to keep going." };
  }
  const refs: { draft: string; request: string }[] = [];
  for (const r of refinements) {
    const { draft, request } = (r ?? {}) as Record<string, unknown>;
    if (typeof draft !== "string" || typeof request !== "string" || request.length > MAX_REFINE_REQUEST) {
      return { ok: false, status: 400, error: BAD_REQUEST };
    }
    refs.push({ draft, request });
  }

  const allText = [...Object.values(clean), ...refs.flatMap((r) => [r.draft, r.request])];
  if (allText.reduce((n, t) => n + t.length, 0) > MAX_TOTAL_CHARS) {
    return { ok: false, status: 413, error: "This conversation has gotten long — start over to keep going." };
  }
  // Only what Jillian typed: Claude's own drafts can mention passports and booking numbers.
  const typed = [...Object.values(clean), ...refs.map((r) => r.request)];
  const sensitive = findSensitive(typed.join("\n"));
  if (sensitive.length) return { ok: false, status: 400, error: SENSITIVE_MESSAGES[sensitive[0]] };

  return { ok: true, req: { tool, fields: clean, refinements: refs } };
}

function buildMessages(req: DraftRequest): BetaMessageParam[] {
  const masked = Object.fromEntries(Object.entries(req.fields).map(([k, v]) => [k, maskContacts(v).text]));
  const messages: BetaMessageParam[] = [{ role: "user", content: buildUserMessage(req.tool, masked) }];
  for (const r of req.refinements ?? []) {
    messages.push({ role: "assistant", content: r.draft }, { role: "user", content: maskContacts(r.request).text });
  }
  return messages;
}

export async function handleDraft(
  request: Request,
  env: Env,
  makeClient: (env: Env) => ClaudeClient = defaultClient,
  keepaliveMs = 15_000,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: BAD_REQUEST }, { status: 400 });
  }
  const checked = validate(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: checked.status });

  const { req } = checked;
  const tool = TOOLS[req.tool];
  const params = baseParams({
    system: buildSystem(req.tool),
    messages: buildMessages(req),
    output_config: { effort: tool.effort },
    tools: tool.webSearch ? [tool.id === "adventure-planner" ? TRIP_WEB_SEARCH : WEB_SEARCH] : undefined,
  });
  return streamClaude(params, env, makeClient, keepaliveMs, `draft (${req.tool})`);
}
