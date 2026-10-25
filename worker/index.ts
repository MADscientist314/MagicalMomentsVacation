import { handleLogin, handleLogout, hasValidSession } from "./auth";
import { handleConversations } from "./conversations";
import { handleDeliverable } from "./deliverables";
import { handleDraft } from "./draft";

const SIGNED_OUT = () => Response.json({ error: "Sign in again to keep going." }, { status: 401 });

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  const post = request.method === "POST";
  const [, api, area, ...rest] = pathname.split("/");
  if (api !== "api") return new Response(null, { status: 404 });

  if (area === "login" && post) return handleLogin(request, env);
  if (area === "logout" && post) return handleLogout();
  if (!(await hasValidSession(request, env))) return SIGNED_OUT();

  if (area === "session") return Response.json({ ok: true });
  if (area === "draft") return post ? handleDraft(request, env) : Response.json({ error: "Use POST." }, { status: 405 });
  if (area === "conversations") {
    return handleConversations(request, env, rest, { waitUntil: (work) => ctx.waitUntil(work) });
  }
  if (area === "deliverables") return handleDeliverable(request, env, rest);
  return Response.json({ error: "not found" }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await route(request, env, ctx);
    // An answer sent without reading the body (401, 409, 429…) can break the connection for the next request.
    // Streamed away rather than buffered, since the caller may not be signed in.
    if (request.body && !request.bodyUsed) await request.body.pipeTo(new WritableStream()).catch(() => {});
    return response;
  },
} satisfies ExportedHandler<Env>;
