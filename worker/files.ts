// Trip files: /api/conversations/:id/files (GET lists them, POST adds one) and /api/conversations/:id/files/:fileId
// (GET opens it, or downloads it with ?download; DELETE removes it). The bytes live in R2 under
// files/<trip id>/<file id>, in the bucket the photos use; D1 keeps the name, type and size.
// These are Jillian's records: nothing here goes into a prompt, so the assistant never reads them.
import { cleanFileName, MAX_FILE_BYTES, MAX_FILES_PER_TRIP, VIEWABLE, type TripFile } from "../shared/files";
import * as store from "./store";

const error = (message: string, status: number) => Response.json({ error: message }, { status });
const fileKey = (tripId: string, id: string) => `files/${tripId}/${id}`;
const TOO_BIG = `That file is too big. The limit is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`;
/** Room for the form's boundary and headers around the file itself. */
const FORM_OVERHEAD = 64 * 1024;
/** Types a browser could run as a page in the app's own address (web pages, XML and SVG, scripts); stored as plain bytes instead. */
const SCRIPTABLE = /^(text\/html|text\/xml|application\/xml|text\/xsl)$|\+xml$|javascript|ecmascript/i;
const MIME = /^[a-z]+\/[a-z0-9][a-z0-9.+-]*$/i;

/** PDFs and photos by their first bytes, so only real ones open in a tab. */
function sniff(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** What a file is kept as: a PDF or photo its bytes prove, else the browser's type, unless that could run as a page. */
export function fileType(bytes: Uint8Array, reported: string): string {
  const sniffed = sniff(bytes);
  if (sniffed) return sniffed;
  const type = reported.trim().toLowerCase();
  return MIME.test(type) && !VIEWABLE.has(type) && !SCRIPTABLE.test(type) ? type : "application/octet-stream";
}

/** `inline` or `attachment`, with the name in UTF-8 and a plain-ASCII copy for older browsers. */
export function disposition(type: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export async function handleTripFiles(
  request: Request,
  env: Env,
  convo: store.Conversation,
  fileId: string | undefined,
  now: number,
): Promise<Response> {
  if (convo.kind !== "trip") return error("Files can be kept with trips.", 400);
  const method = request.method;
  if (!fileId) {
    if (method === "GET") return Response.json(await store.listTripFiles(env.DB, convo.id));
    if (method === "POST") return upload(request, env, convo.id, now);
    return error("Not allowed.", 405);
  }
  const file = await store.getTripFile(env.DB, convo.id, fileId);
  if (!file) return error("That file wasn't found.", 404);
  if (method === "GET") return serve(request, env, convo.id, file);
  if (method === "DELETE") {
    await store.deleteTripFile(env.DB, convo.id, file.id);
    await env.IMAGES.delete(fileKey(convo.id, file.id));
    return Response.json({ ok: true });
  }
  return error("Not allowed.", 405);
}

async function upload(request: Request, env: Env, tripId: string, now: number): Promise<Response> {
  // Turned away before the body is read, so a huge file isn't held in memory.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + FORM_OVERHEAD) return error(TOO_BIG, 413);
  if ((await store.countTripFiles(env.DB, tripId)) >= MAX_FILES_PER_TRIP) {
    return error(`This trip already has ${MAX_FILES_PER_TRIP} files. Delete some first.`, 400);
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return error("That request didn't make sense — try again.", 400);
  if (file.size > MAX_FILE_BYTES) return error(TOO_BIG, 413);
  if (file.size === 0) return error("That file is empty.", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = { name: cleanFileName(file.name), mime: fileType(bytes, file.type), bytes: bytes.length };
  const id = crypto.randomUUID();
  await env.IMAGES.put(fileKey(tripId, id), bytes, { httpMetadata: { contentType: meta.mime } });
  const saved = await store.addTripFile(env.DB, tripId, meta, now, id).catch(async (err) => {
    await env.IMAGES.delete(fileKey(tripId, id));
    throw err;
  });
  return Response.json(saved, { status: 201 });
}

async function serve(request: Request, env: Env, tripId: string, file: TripFile): Promise<Response> {
  const object = await env.IMAGES.get(fileKey(tripId, file.id));
  if (!object) return error("That file wasn't found.", 404);
  const inline = VIEWABLE.has(file.mime) && !new URL(request.url).searchParams.has("download");
  const headers = new Headers({
    "content-type": file.mime,
    "content-disposition": disposition(inline ? "inline" : "attachment", file.name),
    "x-content-type-options": "nosniff",
    // Client records: not left in the browser's cache, in case it's a shared computer.
    "cache-control": "private, no-store",
  });
  // Anything that isn't a PDF or photo is only ever downloaded; the sandbox is a second lock on that.
  // (Chrome's PDF viewer won't open under a sandbox, and a photo can't run anything.)
  if (!VIEWABLE.has(file.mime)) headers.set("content-security-policy", "sandbox; default-src 'none'");
  return new Response(object.body, { headers });
}

/** Deletes a trip's files too: `remove` deletes the trip (its file rows cascade), then R2 is cleaned. */
export async function deleteFilesOf(env: Env, tripId: string, remove: () => Promise<unknown>): Promise<void> {
  const ids = await store.tripFileIds(env.DB, tripId);
  await remove();
  if (ids.length) {
    await env.IMAGES.delete(ids.map((id) => fileKey(tripId, id))).catch((err) =>
      console.error("file cleanup failed:", err instanceof Error ? err.name : typeof err),
    );
  }
}
