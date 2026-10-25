// Client deliverables: generate from a trip conversation (Claude structured output),
// fetch for viewing, and save Jillian's edits as new versions (no AI call).
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  applyPriceProvenance,
  DELIVERABLE_KINDS,
  DELIVERABLE_LABELS,
  DELIVERABLE_SCHEMAS,
  numbersIn,
  validateDeliverable,
  type DeliverableKind,
} from "../shared/deliverables";
import { findSensitive, SENSITIVE_MESSAGES } from "../shared/guard";
import { BRAINS } from "./brains";
import { baseParams, defaultClient, streamClaude, UserFacingError } from "./claude";
import type { ConversationDeps } from "./conversations";
import { buildDeliverableSystem, extractFooter, extractSignature } from "./prompt";
import * as store from "./store";

const LOCK_MS = 10 * 60_000;
const NOT_RIGHT = "That didn't come out right — try again.";
const error = (message: string, status: number) => Response.json({ error: message }, { status });
const isKind = (x: unknown): x is DeliverableKind => DELIVERABLE_KINDS.includes(x as DeliverableKind);

export async function handleGenerateDeliverable(
  request: Request,
  env: Env,
  convo: store.Conversation,
  deps: ConversationDeps,
): Promise<Response> {
  const now = deps.now ?? Date.now;
  const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
  const kind = body?.kind;
  if (convo.kind !== "trip" || !isKind(kind)) return error("That request didn't make sense — try again.", 400);
  const history = await store.getMessages(env.DB, convo.id);
  if (!history.length) return error("Plan the trip first.", 400);
  if (!(await store.tryLock(env.DB, convo.id, now(), LOCK_MS))) {
    return error("Still working on the last one — give it a moment.", 409);
  }

  const messages: BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as BetaMessageParam),
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Create the client ${DELIVERABLE_LABELS[kind].toLowerCase()} for this trip, following the rules for a ${kind}.`,
          cache_control: { type: "ephemeral" },
        },
      ],
    },
  ];
  const params = baseParams({
    system: buildDeliverableSystem(),
    messages,
    // No web search here: citations and structured output can't be combined.
    output_config: { effort: "medium", format: { type: "json_schema", schema: DELIVERABLE_SCHEMAS[kind] } },
  });
  // Only amounts Jillian typed herself may reach the client document.
  const allowed = new Set(history.filter((m) => m.role === "user").flatMap((m) => numbersIn(m.content)));

  return streamClaude(params, env, deps.makeClient ?? defaultClient, deps.keepaliveMs ?? 15_000, `${kind} deliverable`, {
    forwardText: false,
    async beforeDone({ text, stopReason }) {
      if (stopReason === "refusal") throw new UserFacingError("I can't make that one — try rewording what's in the trip.");
      if (stopReason === "max_tokens") throw new UserFacingError("That came out too long — try again.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new UserFacingError(NOT_RIGHT);
      }
      const checked = validateDeliverable(kind, parsed);
      if (!checked.ok) throw new UserFacingError(NOT_RIGHT);
      const data = applyPriceProvenance(kind, checked.data, allowed);
      const saved = await store.addDeliverable(env.DB, convo.id, kind, data, now());
      return [{ event: "deliverable", data: { id: saved.id, kind, version: saved.version } }];
    },
    finally: () => store.releaseLock(env.DB, convo.id),
    waitUntil: deps.waitUntil,
  });
}

/** /api/deliverables/:id (GET) and /api/deliverables/:id/edit (POST). */
export async function handleDeliverable(
  request: Request,
  env: Env,
  segments: string[],
  now: () => number = Date.now,
): Promise<Response> {
  const [id, action] = segments;
  const existing = id ? await store.getDeliverable(env.DB, id) : null;
  if (!existing) return error("That document wasn't found.", 404);

  if (!action && request.method === "GET") {
    return Response.json({
      ...existing,
      footer: extractFooter(BRAINS["reference/compliance"]),
      signature: extractSignature(BRAINS["reference/voice"]),
    });
  }

  if (action === "edit" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { data?: unknown } | null;
    const checked = validateDeliverable(existing.kind, body?.data);
    if (!checked.ok) return error("Something in that edit doesn't fit — check every field has a value.", 400);
    const sensitive = findSensitive(JSON.stringify(checked.data));
    if (sensitive.length) return error(SENSITIVE_MESSAGES[sensitive[0]], 400);
    const saved = await store.addDeliverable(env.DB, existing.conversation_id, existing.kind, checked.data, now());
    return Response.json({ id: saved.id, kind: existing.kind, version: saved.version });
  }

  return error("not found", 404);
}
