import { createRemoteJWKSet, jwtVerify } from "jose";

// Cloudflare Access sits in front of the whole site; this re-checks its signed
// token on the API so nothing can reach Claude around the login.
const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyAccess(request: Request, env: Env): Promise<{ email: string } | Response> {
  if (env.ACCESS_MODE === "off") return { email: "local" };

  const team = env.TEAM_DOMAIN.replace(/\/+$/, "");
  if (!team || !env.POLICY_AUD) {
    return Response.json({ error: "Login isn't set up yet." }, { status: 500 });
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return Response.json({ error: "Sign in again to keep going." }, { status: 401 });

  let jwks = jwksByTeam.get(team);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
    jwksByTeam.set(team, jwks);
  }

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: team, audience: env.POLICY_AUD });
    return { email: typeof payload.email === "string" ? payload.email : "unknown" };
  } catch {
    return Response.json({ error: "Sign in again to keep going." }, { status: 401 });
  }
}
