// A single shared password ("the magic words") guards the API. Logging in sets a
// signed cookie; the signature is keyed on the password itself, so changing the
// APP_PASSWORD secret signs everyone out.

export const SESSION_COOKIE = "mmv_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();

/** Case, spaces and punctuation don't matter: "Magic Words!" matches "magic-words". */
export function normalizePassword(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
}

export async function passwordMatches(given: string, expected: string): Promise<boolean> {
  const want = normalizePassword(expected);
  if (!want) return false;
  // Compare fixed-length digests so the time taken doesn't reveal how much matched.
  const [a, b] = await Promise.all([sha256(normalizePassword(given)), sha256(want)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sign(expiry: number, password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`mmv-session:${normalizePassword(password)}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(String(expiry))));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const cookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

export async function hasValidSession(request: Request, env: Env, now = Date.now()): Promise<boolean> {
  if (!normalizePassword(env.APP_PASSWORD ?? "")) return false;
  const match = (request.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=(\\d+)\\.([\\w-]+)`));
  if (!match) return false;
  const expiry = Number(match[1]);
  if (expiry * 1000 < now) return false;
  return match[2] === (await sign(expiry, env.APP_PASSWORD));
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!normalizePassword(env.APP_PASSWORD ?? "")) {
    return Response.json({ error: "The password isn't set up yet." }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const given = typeof body?.password === "string" ? body.password : "";
  if (!(await passwordMatches(given, env.APP_PASSWORD))) {
    return Response.json({ error: "That's not quite the magic word — try again." }, { status: 401 });
  }
  const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": cookie(`${expiry}.${await sign(expiry, env.APP_PASSWORD)}`, SESSION_SECONDS) } },
  );
}

export function handleLogout(): Response {
  return Response.json({ ok: true }, { headers: { "set-cookie": cookie("", 0) } });
}
