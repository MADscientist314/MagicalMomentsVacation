import { handleLogin, handleLogout, hasValidSession } from "./auth";
import { handleChat } from "./chat";
import { handleDraft } from "./draft";

const SIGNED_OUT = () => Response.json({ error: "Sign in again to keep going." }, { status: 401 });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const post = request.method === "POST";

    if (pathname === "/api/login" && post) return handleLogin(request, env);
    if (pathname === "/api/logout" && post) return handleLogout();
    if (pathname === "/api/session") {
      return (await hasValidSession(request, env)) ? Response.json({ ok: true }) : SIGNED_OUT();
    }
    if (pathname === "/api/draft") {
      if (!post) return Response.json({ error: "Use POST." }, { status: 405 });
      if (!(await hasValidSession(request, env))) return SIGNED_OUT();
      return handleDraft(request, env);
    }
    if (pathname === "/api/chat") {
      if (!post) return Response.json({ error: "Use POST." }, { status: 405 });
      if (!(await hasValidSession(request, env))) return SIGNED_OUT();
      return handleChat(request, env);
    }
    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
