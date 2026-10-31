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
import type { Itinerary, Proposal } from "../shared/deliverables";
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

/** Why Google refused, by its reason code, finishing "Google wouldn't make that one: …". */
const REFUSALS: Record<string, string> = {
  SAFETY: "its safety filter flagged the request",
  IMAGE_SAFETY: "its safety filter flagged the picture it was making",
  PROHIBITED_CONTENT: "it treats the request as something it never makes",
  IMAGE_PROHIBITED_CONTENT: "it treats the picture as something it never makes",
  RECITATION: "the picture came out too close to an existing image (copyright)",
  IMAGE_RECITATION: "the picture came out too close to an existing image (copyright)",
  BLOCKLIST: "a word in the description is on its blocked list",
  OTHER: "it didn't say why",
};

function refusal(err: ImageError): string {
  if (!err.reason) return IMAGE_ERRORS.blocked[1];
  const why = REFUSALS[err.reason] ?? `it gave the reason ${err.reason}`;
  const said = err.note?.trim() ? ` Google said: "${err.note.trim().slice(0, 300)}"` : "";
  return `Google wouldn't make that one: ${why}.${said} Try describing it differently.`;
}

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
  /** `plan` is the trip's plan in words, for trip pictures. */
  subject(card?: CardKind, plan?: string | null): string;
  /** Set for trips, which can also make pictures for their itineraries. */
  trip?: store.Conversation;
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
    trip,
    subject: (card = "picture", plan) =>
      [
        card === "picture"
          ? `Make a picture of the ${trip.title} enjoying their trip, for Jillian to share with them (in a proposal, an email or a message). ${LOOK}`
          : `Make a "${CARD_KINDS[card]}" card for the ${trip.title}'s trip, for Jillian to send them. ${LOOK}`,
        plan && TRIP_SCENES[card],
        d.destination && `Where: ${d.destination}${d.resort ? ` (${d.resort})` : ""}.`,
        d.dates && `When: ${d.dates}.`,
        d.party && `Who's going: ${d.party}.`,
        plan && `Their plan:\n"""\n${plan}\n"""`,
        card === "picture" && "No words on the image unless her direction asks for them.",
      ]
        .filter(Boolean)
        .join("\n"),
  };
}

const LOOK = "It should look like a bright, natural travel photo, like a travel magazine.";
/** Trips: their own photos (or pictures made for the trip earlier) are the family; without them, a stock-style family. */
const FAMILY =
  "The attached pictures show this family (their own photos, or pictures made for this trip earlier). Put these same people in the picture, looking like themselves.";
const STOCK = "Show a family that matches who's going.";

/** What each kind of trip picture shows from the family's plan. */
const TRIP_SCENES: Record<CardKind, string> = {
  picture: "Show them living a moment from their plan below, as if they were there.",
  countdown: "Show them looking forward to a moment from their plan below.",
  birthday: "Show a birthday celebration during their trip, in one of the places from their plan below.",
  "welcome-home": "Show a few highlights from their plan below, like happy memories.",
  "bon-voyage": "Show them setting off on the first day of their plan below.",
};

const MAX_PLAN = 6_000;
const DAY_PLAN = /^###\s+Day\b/m;

/** The family's plan in words: the latest itinerary, or else the latest day-by-day plan in the trip's conversation. */
async function tripPlan(env: Env, tripId: string): Promise<string | null> {
  const latest = (await store.listDeliverables(env.DB, tripId)).find((doc) => doc.kind === "itinerary");
  const itinerary = latest ? ((await store.getDeliverable(env.DB, latest.id))?.data as Itinerary | undefined) : undefined;
  if (itinerary) {
    return itinerary.days
      .map((day) => `${day.title}: ${day.items.map((i) => (i.time ? `${i.time} ` : "") + i.text).join("; ")}`)
      .join("\n")
      .slice(0, MAX_PLAN);
  }
  const messages = await store.getMessages(env.DB, tripId);
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && DAY_PLAN.test(m.content)) return splitDraft(m.content).client.slice(0, MAX_PLAN);
  }
  return null;
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

type DocumentSlot =
  | { kind: "itinerary"; data: Itinerary; slot: "cover" | number }
  | { kind: "proposal"; data: Proposal; slot: "cover" | number };

/** A picture for a client document: the cover, or one itinerary day or proposal option. */
function documentSubject(trip: store.Conversation, doc: DocumentSlot): string {
  const d = trip.details;
  const where = [d.destination, d.resort].filter(Boolean).join(", ");
  let scene: string;
  if (doc.kind === "itinerary") {
    const day = doc.slot === "cover" ? null : doc.data.days[doc.slot];
    scene = day
      ? `Make a picture for one day of the ${trip.title}'s itinerary: the family enjoying this day. ${LOOK}\nThe day: ${day.title}\nPlans: ${day.items.map((i) => i.text).join("; ")}`
      : `Make the cover picture for the ${trip.title}'s itinerary, "${doc.data.title}": the family enjoying this trip. ${LOOK}\nThe plan: ${doc.data.days.map((x) => x.title).join("; ")}.`;
  } else {
    const option = doc.slot === "cover" ? null : doc.data.options[doc.slot];
    scene = option
      ? `Make a picture for one option in the ${trip.title}'s trip proposal: the family enjoying this option. ${LOOK}\nThe option: ${option.name}\nWhat it is: ${option.summary}${option.highlights.length ? `\nHighlights: ${option.highlights.join("; ")}` : ""}`
      : `Make the cover picture for the ${trip.title}'s trip proposal, "${doc.data.title}": the family enjoying this trip. ${LOOK}\nThe options: ${doc.data.options.map((o) => o.name).join("; ")}.`;
  }
  return [scene, where && `Where: ${where}.`, d.party && `Who's going: ${d.party}.`, "No words on the image."].filter(Boolean).join("\n");
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

  // A document picture: this trip's itinerary or proposal, and its cover or a day or option that's in it.
  let document: DocumentSlot | null = null;
  if (body.deliverableId !== undefined) {
    const doc = typeof body.deliverableId === "string" ? await store.getDeliverable(env.DB, body.deliverableId) : null;
    const count =
      doc?.kind === "itinerary" ? (doc.data as Itinerary).days.length : doc?.kind === "proposal" ? (doc.data as Proposal).options.length : 0;
    const slot = body.slot;
    const validSlot = slot === "cover" || (Number.isInteger(slot) && (slot as number) >= 0 && (slot as number) < count);
    if (!ctx.trip || !doc || !count || doc.conversation_id !== ctx.trip.id || !validSlot) return error(BAD_REQUEST, 400);
    document = { kind: doc.kind, data: doc.data, slot } as DocumentSlot;
  }

  if (body.shape !== undefined && !isShape(body.shape)) return error(BAD_REQUEST, 400);
  const shape = (body.shape as Shape | undefined) ?? (document ? "wide" : ctx.shape);
  if (ctx.isTrip && !document && !isCardKind(body.card)) return error(BAD_REQUEST, 400);

  const raw = body.direction ?? "";
  if (typeof raw !== "string" || raw.length > MAX_DIRECTION) return error(BAD_REQUEST, 400);
  const sensitive = findSensitive(raw);
  if (sensitive.length) return error(SENSITIVE_MESSAGES[sensitive[0]], 400);
  const direction = maskContacts(raw.trim()).text;

  const photoIds = body.photoIds ?? [];
  if (!Array.isArray(photoIds) || photoIds.length > MAX_REFERENCE_PHOTOS || new Set(photoIds).size !== photoIds.length) {
    return error(BAD_REQUEST, 400);
  }
  // Reference pictures can be her photos or pictures made earlier (to keep the same family); the one being changed must be a made one.
  const wanted: { id: unknown; kind: "any" | "generated" }[] = photoIds.map((id) => ({ id, kind: "any" }));
  if (body.baseImageId !== undefined) wanted.unshift({ id: body.baseImageId, kind: "generated" });
  for (const w of wanted) {
    const image = typeof w.id === "string" ? await store.getImage(env.DB, w.id) : null;
    if (!image || (w.kind !== "any" && image.kind !== w.kind) || !store.ownsImage(owner, image)) return error(BAD_REQUEST, 400);
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
  const editing = body.baseImageId !== undefined;
  const subject = ctx.trip
    ? document
      ? documentSubject(ctx.trip, document)
      : ctx.subject(card, await tripPlan(env, ctx.trip.id))
    : ctx.subject(card);
  // A trip's pictures show its family: their own photos when chosen, otherwise a family that fits who's going.
  const family = ctx.trip && !editing ? (photoIds.length ? FAMILY : STOCK) : null;
  const prompt = buildPrompt(family ? `${subject}\n${family}` : subject, direction, editing, family ? 0 : photoIds.length);
  let made: InlineImage;
  try {
    made = await makeClient(env).generate({ prompt, images: inputs, aspect: SHAPES[shape].aspect });
  } catch (err) {
    const kind = err instanceof ImageError ? err.kind : "failed";
    // Codes only: Google's note can describe the photo, so it goes to Jillian, not the logs.
    console.error("image failed:", err instanceof ImageError ? `${err.kind} ${err.reason ?? ""}`.trim() : err instanceof Error ? err.name : typeof err);
    const [status, message] = IMAGE_ERRORS[kind];
    return error(kind === "blocked" && err instanceof ImageError ? refusal(err) : message, status);
  }
  const mime = sniff(made.data);
  if (!mime) return error(IMAGE_ERRORS.failed[1], 502);

  const id = crypto.randomUUID();
  await env.IMAGES.put(key(id), made.data, { httpMetadata: { contentType: mime } });
  const meta = await store
    .addImage(
      env.DB,
      {
        owner,
        kind: "generated",
        mime,
        bytes: made.data.length,
        shape,
        prompt: direction,
        model: IMAGE_MODEL,
        cost_usd: IMAGE_COST_USD,
        purpose: document ? "document" : "gallery",
      },
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
