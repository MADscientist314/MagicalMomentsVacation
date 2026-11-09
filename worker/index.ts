import { handleLogin, handleLogout, hasValidSession, sessionCookie } from "./auth";
import { handleActiveTrips } from "./bookings";
import { handleConversations } from "./conversations";
import { handleDeliverable } from "./deliverables";
import { handleDraft } from "./draft";
import { handleDrafts } from "./drafts";
import { handleImages } from "./images";
import { handleQuoteLines, handleReadImage } from "./quotes";
import { handleSharePage } from "./shares";

const SIGNED_OUT = () => Response.json({ error: "Sign in again to keep going." }, { status: 401 });

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  const post = request.method === "POST";
  const [, api, area, ...rest] = pathname.split("/");
  // A share link: the family's page needs no sign-in, and shows only what Jillian shared.
  if (api === "p") return handleSharePage(request, env, [area, ...rest].filter(Boolean));
  if (api !== "api") return new Response(null, { status: 404 });

  if (area === "login" && post) return handleLogin(request, env);
  if (area === "logout" && post) return handleLogout();
  if (!(await hasValidSession(request, env))) return SIGNED_OUT();

  // The app checks this each time it opens, which renews the 30 days.
  if (area === "session") return Response.json({ ok: true }, { headers: { "set-cookie": await sessionCookie(env) } });
  if (area === "draft") return post ? handleDraft(request, env) : Response.json({ error: "Use POST." }, { status: 405 });
  if (area === "conversations") {
    return handleConversations(request, env, rest, { waitUntil: (work) => ctx.waitUntil(work) });
  }
  if (area === "deliverables") return handleDeliverable(request, env, rest);
  if (area === "bookings") return handleActiveTrips(request, env);
  if (area === "drafts") return handleDrafts(request, env, rest);
  if (area === "images") return handleImages(request, env, rest);
  if (area === "read-image") return post ? handleReadImage(request, env) : Response.json({ error: "Use POST." }, { status: 405 });
  if (area === "quote-lines") return post ? handleQuoteLines(request, env) : Response.json({ error: "Use POST." }, { status: 405 });
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
