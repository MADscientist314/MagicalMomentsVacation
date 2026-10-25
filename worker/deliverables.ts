// Client deliverables: generate (Claude, structured output), fetch and edit.
import type { ConversationDeps } from "./conversations";
import type { Conversation } from "./store";

export async function handleGenerateDeliverable(
  _request: Request,
  _env: Env,
  _convo: Conversation,
  _deps: ConversationDeps,
): Promise<Response> {
  return Response.json({ error: "not built yet" }, { status: 501 });
}

export async function handleDeliverable(_request: Request, _env: Env, _segments: string[]): Promise<Response> {
  return Response.json({ error: "not built yet" }, { status: 501 });
}
