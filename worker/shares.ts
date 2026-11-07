// Share links: /api/deliverables/:id/share (signed in) makes, moves or stops a trip document's link;
// /p/<token> (anyone with the link) shows that version as a printable page, and /p/<token>/<image> its pictures.
import { documentPhotoIds, renderDeliverableHtml, type DeliverableData } from "../shared/deliverables";
import { SHARE_MS, SHARE_TOKEN, sharePath, type ShareInfo } from "../shared/shares";
import { BRAINS } from "./brains";
import { extractFooter, extractSignature } from "./prompt";
import * as store from "./store";

type Doc = NonNullable<Awaited<ReturnType<typeof store.getDeliverable>>>;

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

const info = (s: store.StoredShare): ShareInfo => ({
  path: sharePath(s.token),
  deliverableId: s.deliverable_id,
  version: s.version,
  expiresAt: s.expires_at,
});

/** The live link for this trip's kind of document, if it hasn't run out. */
export async function shareFor(env: Env, doc: Doc, now: number): Promise<ShareInfo | null> {
  const s = await store.getShareFor(env.DB, doc.conversation_id, doc.kind);
  return s && s.expires_at > now ? info(s) : null;
}

/** POST shares this version (the trip's link for this kind moves to it, for another 30 days); DELETE stops it. */
export async function handleShare(request: Request, env: Env, doc: Doc, now: number): Promise<Response> {
  if (request.method === "POST") {
    const s = await store.upsertShare(env.DB, doc, newToken(), now, SHARE_MS);
    return Response.json(info(s));
  }
  if (request.method === "DELETE") {
    await store.deleteShareFor(env.DB, doc.conversation_id, doc.kind);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Not allowed." }, { status: 405 });
}

// ---------- the family's page ----------

const PRIVATE = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};

const csp = (nonce: string) =>
  [
    "default-src 'none'",
    "img-src 'self' data:",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    `script-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

/** A plain page for a link that isn't there or has run out. */
function notice(status: number, heading: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${heading}</title>
<style>body{margin:0;background:#fffbf5;color:#2c3333;font:17px/1.6 system-ui,sans-serif}main{max-width:560px;margin:12vh auto;padding:0 24px}
.brand{font:italic 500 15px Georgia,serif;color:#7b3f99}h1{font:italic 500 28px Georgia,serif;color:#7b3f99;margin:6px 0 12px}</style></head>
<body><main><div class="brand">Magical Vacations by Jillian</div><h1>${heading}</h1><p>${body}</p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { ...PRIVATE, "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" },
  });
}

const GONE = () => notice(404, "This link isn't working", "Check that the whole link was copied, or ask Jillian for a fresh one.");
const EXPIRED = () => notice(410, "This trip page has expired", "Links last about a month. Ask Jillian for a fresh one.");

/** /p/<token> and /p/<token>/<imageId>: no sign-in, so it shows only what she shared, and only until it runs out. */
export async function handleSharePage(request: Request, env: Env, segments: string[], now = Date.now()): Promise<Response> {
  const [token, imageId, ...more] = segments;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
  if (!token || !SHARE_TOKEN.test(token) || more.length) return GONE();
  const share = await store.getShare(env.DB, token);
  if (!share) return GONE();
  if (share.expires_at <= now) return EXPIRED();
  const doc = await store.getDeliverable(env.DB, share.deliverable_id);
  if (!doc) return GONE();
  const data = doc.data as DeliverableData;
  const photoIds = documentPhotoIds(doc.kind, data);

  if (imageId !== undefined) {
    // Only the pictures placed in this document, and only while they still belong to the trip.
    const image = photoIds.includes(imageId) ? await store.getImage(env.DB, imageId) : null;
    if (!image || !store.ownsImage({ type: "trip", id: doc.conversation_id }, image)) return new Response(null, { status: 404 });
    const object = await env.IMAGES.get(`images/${imageId}`);
    if (!object) return new Response(null, { status: 404 });
    return new Response(object.body, { headers: { ...PRIVATE, "content-type": image.mime } });
  }

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = renderDeliverableHtml(doc.kind, data, {
    footer: extractFooter(BRAINS["reference/compliance"]),
    signature: extractSignature(BRAINS["reference/voice"]),
    mode: "client",
    photos: Object.fromEntries(photoIds.map((id) => [id, `${sharePath(token)}/${id}`])),
    share: { nonce },
  });
  return new Response(request.method === "HEAD" ? null : html, {
    headers: { ...PRIVATE, "content-type": "text/html; charset=utf-8", "content-security-policy": csp(nonce) },
  });
}
