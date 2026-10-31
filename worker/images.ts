// Photos and Nano Banana images for Spread the Magic posts and trip cards: /api/images[...].
// The bytes live in R2 under images/<id>; D1 keeps who each image belongs to. The prompt is
// built here from the saved post or trip, so the browser only sends ids, a shape and her words.
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../shared/guard";
import {
  CARD_KINDS,
  DAILY_IMAGE_LIMIT,
  defaultShape,
  IMAGE_COST_USD,
  isCardKind,
  isShape,
  MAX_DIRECTION,
  MAX_PHOTO_BYTES,
  MAX_REFERENCE_PHOTOS,
  SHAPES,
  type CardKind,
  type ImageOwner,
  type Shape,
} from "../shared/images";
import { splitDraft } from "../shared/sections";
import { BRAINS } from "./brains";
import { defaultImageClient, IMAGE_MODEL, ImageError, type ImageClient, type InlineImage } from "./gemini";
import * as store from "./store";

export interface ImageDeps {
  now?: () => number;
  makeImageClient?: (env: Env) => ImageClient;
}

const DAY = 24 * 60 * 60_000;
const BAD_REQUEST = "That request didn't make sense — try again.";
const key = (id: string) => `images/${id}`;

const IMAGE_ERRORS: Record<ImageError["kind"], [number, string]> = {
  "no-key": [503, "Images aren't connected yet (Google API key)."],
  billing: [503, "Images need billing turned on in Google AI Studio."],
  blocked: [422, "Google wouldn't make that one — try describing it differently."],
  busy: [429, "It's busy right now — try again in a minute."],
  failed: [502, "No image came back — try again."],
};

const error = (message: string, status: number) => Response.json({ error: message }, { status });

/** "draft:<id>", "trip:<id>" or "library". */
function parseOwner(raw: unknown): ImageOwner | null {
  if (raw === "library") return { type: "library" };
  const m = typeof raw === "string" ? /^(draft|trip):([A-Za-z0-9-]{1,64})$/.exec(raw) : null;
  return m ? { type: m[1] as "draft" | "trip", id: m[2] } : null;
}

/** JPEG, PNG or WebP by their first bytes; anything else isn't a photo. */
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

interface OwnerContext {
  shape: Shape;
  /** Trips make cards, so they need a card kind. */
  isTrip: boolean;
  /** A standalone image has nothing to go on but her words and photos. */
  standalone: boolean;
  subject(card?: CardKind): string;
}

async function loadOwner(env: Env, owner: ImageOwner): Promise<OwnerContext | Response> {
  if (owner.type === "library") {
    return {
      shape: "portrait",
      isTrip: false,
      standalone: true,
      subject: () =>
        "Make one image for Jillian Jochum's travel-planning business, Magical Moments Vacations, as her direction describes. It's for her marketing: social media, flyers, emails or her website.",
    };
  }
  if (owner.type === "draft") {
    const draft = await store.getDraft(env.DB, owner.id);
    if (!draft) return error("That saved post or trip wasn't found.", 404);
    if (draft.tool !== "spread-the-magic") return error("Images can be added to Spread the Magic posts and trips.", 400);
    const channel = draft.request.fields.channel || "social media post";
    return {
      shape: defaultShape(draft.request.fields.channel),
      isTrip: false,
      standalone: false,
      subject: () => `Make one image to go with this ${channel}. The post:\n"""\n${splitDraft(draft.content).client}\n"""`,
    };
  }
  const trip = await store.getConversation(env.DB, owner.id);
  if (!trip) return error("That saved post or trip wasn't found.", 404);
  if (trip.kind !== "trip") return error("Images can be added to Spread the Magic posts and trips.", 400);
  const d = trip.details;
  return {
    shape: "portrait",
    isTrip: true,
    standalone: false,
    subject: (card) =>
      [
        `Make a "${CARD_KINDS[card ?? "countdown"]}" card for the ${trip.title}'s trip, for Jillian to send them.`,
        d.destination && `Where: ${d.destination}${d.resort ? ` (${d.resort})` : ""}.`,
        d.dates && `When: ${d.dates}.`,
        d.party && `Who's going: ${d.party}.`,
      ]
        .filter(Boolean)
        .join("\n"),
  };
}

export async function handleImages(request: Request, env: Env, segments: string[], deps: ImageDeps = {}): Promise<Response> {
  const now = deps.now ?? Date.now;
  const [id] = segments;
  const method = request.method;

  if (!id) {
    if (method === "GET") {
      const owner = parseOwner(new URL(request.url).searchParams.get("owner"));
      if (!owner) return error(BAD_REQUEST, 400);
      return Response.json(await store.listImages(env.DB, owner));
    }
    if (method === "POST") return upload(request, env, now());
    return error("Not allowed.", 405);
  }
  if (id === "generate") {
    return method === "POST" ? generate(request, env, now(), deps.makeImageClient ?? defaultImageClient) : error("Use POST.", 405);
  }

  const image = await store.getImage(env.DB, id);
  if (!image) return error("That image wasn't found.", 404);
  if (method === "GET") {
    const object = await env.IMAGES.get(key(id));
    if (!object) return error("That image wasn't found.", 404);
    return new Response(object.body, {
      headers: { "content-type": image.mime, "cache-control": "private, max-age=31536000, immutable" },
    });
  }
  if (method === "DELETE") {
    await store.deleteImage(env.DB, id);
    await env.IMAGES.delete(key(id));
    return Response.json({ ok: true });
  }
  return error("Not allowed.", 405);
}

async function upload(request: Request, env: Env, now: number): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const owner = parseOwner(form?.get("owner"));
  const file = form?.get("file");
  if (!owner || !(file instanceof Blob)) return error(BAD_REQUEST, 400);
  const ctx = await loadOwner(env, owner);
  if (ctx instanceof Response) return ctx;
  if (file.size > MAX_PHOTO_BYTES) return error("That photo is too big — try a smaller one.", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) return error("That file isn't a photo — use a JPEG, PNG or WebP.", 400);

  const id = crypto.randomUUID();
  await env.IMAGES.put(key(id), bytes, { httpMetadata: { contentType: mime } });
  const meta = await store
    .addImage(env.DB, { owner, kind: "upload", mime, bytes: bytes.length, shape: null, prompt: "", model: null, cost_usd: 0 }, now, id)
    .catch(async (err) => {
      await env.IMAGES.delete(key(id));
      throw err;
    });
  return Response.json(meta, { status: 201 });
}

async function readImage(env: Env, id: string): Promise<InlineImage | null> {
  const [image, object] = await Promise.all([store.getImage(env.DB, id), env.IMAGES.get(key(id))]);
  return image && object ? { mimeType: image.mime, data: new Uint8Array(await object.arrayBuffer()) } : null;
}

function buildPrompt(subject: string, direction: string, editing: boolean, photos: number): string {
  const others = editing ? "other " : "";
  return [
    subject,
    editing && "Change the first attached image as Jillian asks below. Keep everything else about it the same.",
    photos > 0 &&
      `The ${others}attached ${photos === 1 ? "photo is" : "photos are"} Jillian's own. Use ${photos === 1 ? "it" : "them"} as her direction says (the people, the place or the style).`,
    direction && `Jillian's direction:\n"""\n${direction}\n"""`,
    BRAINS.images,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function generate(request: Request, env: Env, now: number, makeClient: (env: Env) => ImageClient): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const owner = parseOwner(body?.owner);
  if (!body || !owner) return error(BAD_REQUEST, 400);
  const ctx = await loadOwner(env, owner);
  if (ctx instanceof Response) return ctx;

  if (body.shape !== undefined && !isShape(body.shape)) return error(BAD_REQUEST, 400);
  const shape = (body.shape as Shape | undefined) ?? ctx.shape;
  if (ctx.isTrip && !isCardKind(body.card)) return error(BAD_REQUEST, 400);

  const raw = body.direction ?? "";
  if (typeof raw !== "string" || raw.length > MAX_DIRECTION) return error(BAD_REQUEST, 400);
  const sensitive = findSensitive(raw);
  if (sensitive.length) return error(SENSITIVE_MESSAGES[sensitive[0]], 400);
  const direction = maskContacts(raw.trim()).text;

  const photoIds = body.photoIds ?? [];
  if (!Array.isArray(photoIds) || photoIds.length > MAX_REFERENCE_PHOTOS || new Set(photoIds).size !== photoIds.length) {
    return error(BAD_REQUEST, 400);
  }
  const wanted: { id: unknown; kind: "upload" | "generated" }[] = photoIds.map((id) => ({ id, kind: "upload" }));
  if (body.baseImageId !== undefined) wanted.unshift({ id: body.baseImageId, kind: "generated" });
  for (const w of wanted) {
    const image = typeof w.id === "string" ? await store.getImage(env.DB, w.id) : null;
    if (!image || image.kind !== w.kind || !store.ownsImage(owner, image)) return error(BAD_REQUEST, 400);
  }
  if (ctx.standalone && !direction && !wanted.length) return error("Say what the image should show, or add a photo.", 400);

  if ((await store.countGeneratedSince(env.DB, now - DAY)) >= DAILY_IMAGE_LIMIT) {
    return error(`That's ${DAILY_IMAGE_LIMIT} images today — try again tomorrow.`, 429);
  }

  const inputs: InlineImage[] = [];
  for (const w of wanted) {
    const image = await readImage(env, w.id as string);
    if (!image) return error("One of those photos is missing — delete it and add it again.", 404);
    inputs.push(image);
  }

  const card = isCardKind(body.card) ? body.card : undefined;
  const prompt = buildPrompt(ctx.subject(card), direction, body.baseImageId !== undefined, photoIds.length);
  let made: InlineImage;
  try {
    made = await makeClient(env).generate({ prompt, images: inputs, aspect: SHAPES[shape].aspect });
  } catch (err) {
    const kind = err instanceof ImageError ? err.kind : "failed";
    console.error("image failed:", err instanceof ImageError ? err.kind : err instanceof Error ? err.name : typeof err);
    const [status, message] = IMAGE_ERRORS[kind];
    return error(message, status);
  }
  const mime = sniff(made.data);
  if (!mime) return error(IMAGE_ERRORS.failed[1], 502);

  const id = crypto.randomUUID();
  await env.IMAGES.put(key(id), made.data, { httpMetadata: { contentType: mime } });
  const meta = await store
    .addImage(
      env.DB,
      { owner, kind: "generated", mime, bytes: made.data.length, shape, prompt: direction, model: IMAGE_MODEL, cost_usd: IMAGE_COST_USD },
      now,
      id,
    )
    .catch(async (err) => {
      await env.IMAGES.delete(key(id));
      throw err;
    });
  return Response.json(meta, { status: 201 });
}

/** Deletes a post's or trip's images too: `remove` deletes the owner (its image rows cascade), then R2 is cleaned. */
export async function deleteImagesOf(env: Env, owner: ImageOwner, remove: () => Promise<unknown>): Promise<void> {
  const ids = await store.imageIdsOf(env.DB, owner);
  await remove();
  if (ids.length) {
    await env.IMAGES.delete(ids.map(key)).catch((err) => console.error("image cleanup failed:", err instanceof Error ? err.name : typeof err));
  }
}
