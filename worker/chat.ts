import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ChatMessage } from "../shared/chat";
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../shared/guard";
import { baseParams, defaultClient, streamClaude, WEB_SEARCH, type ClaudeClient } from "./claude";
import { buildChatSystem } from "./prompt";

const MAX_MESSAGES = 40;
const MAX_TOTAL_CHARS = 60_000;
const MAX_USER_MESSAGE = 4_000;
const BAD_REQUEST = "That message didn't make sense — try again.";
const TOO_LONG = "This chat has gotten long — start a new chat to keep going.";

type Checked = { ok: true; messages: ChatMessage[] } | { ok: false; status: number; error: string };

function validate(body: unknown): Checked {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, status: 400, error: BAD_REQUEST };
  if (messages.length > MAX_MESSAGES) return { ok: false, status: 413, error: TOO_LONG };

  const clean: ChatMessage[] = [];
  for (const [i, m] of messages.entries()) {
    const { role, content } = (m ?? {}) as Record<string, unknown>;
    // Turns alternate, starting and ending with Jillian.
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (role !== expected || typeof content !== "string" || !content.trim()) {
      return { ok: false, status: 400, error: BAD_REQUEST };
    }
    if (role === "user" && content.length > MAX_USER_MESSAGE) {
      return { ok: false, status: 400, error: "That message is too long — keep it under 4,000 characters." };
    }
    clean.push({ role: expected, content });
  }
  if (clean.at(-1)?.role !== "user") return { ok: false, status: 400, error: BAD_REQUEST };
  if (clean.reduce((n, m) => n + m.content.length, 0) > MAX_TOTAL_CHARS) {
    return { ok: false, status: 413, error: TOO_LONG };
  }

  // Only what Jillian said; Claude's replies can mention passports and booking numbers.
  const said = clean.filter((m) => m.role === "user").map((m) => m.content);
  const sensitive = findSensitive(said.join("\n"));
  if (sensitive.length) return { ok: false, status: 400, error: SENSITIVE_MESSAGES[sensitive[0]] };

  return { ok: true, messages: clean };
}

export async function handleChat(
  request: Request,
  env: Env,
  makeClient: (env: Env) => ClaudeClient = defaultClient,
  keepaliveMs = 15_000,
): Promise<Response> {
  const body = await request.json().catch(() => null);
  const checked = validate(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: checked.status });

  const messages: BetaMessageParam[] = checked.messages.map((m) =>
    m.role === "user" ? { role: "user", content: maskContacts(m.content).text } : { role: "assistant", content: m.content },
  );
  const params = baseParams({
    system: buildChatSystem(),
    messages,
    output_config: { effort: "medium" },
    tools: [WEB_SEARCH],
  });
  return streamClaude(params, env, makeClient, keepaliveMs, "chat");
}
