import { beforeEach, describe, expect, it } from "vitest";
import { SENSITIVE_MESSAGES } from "../shared/guard";
import { MAX_PHOTO_BYTES, type ImageMeta } from "../shared/images";
import { BRAINS } from "../worker/brains";
import { handleConversations } from "../worker/conversations";
import { handleDrafts } from "../worker/drafts";
import { ImageError, type ImageClient, type InlineImage } from "../worker/gemini";
import { handleImages } from "../worker/images";
import * as store from "../worker/store";
import { fakeD1 } from "./helpers/fakeD1";
import { fakeR2 } from "./helpers/fakeR2";

const JPEG = (n = 1) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, n, n]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);
const DAY = 24 * 60 * 60_000;

const POST =
  "Pool day magic is calling! ☀️ Message me to plan yours.\n\n## For Jillian only\n**Compliance checklist:** ✓ footer";

let env: Env;
let r2: ReturnType<typeof fakeR2>;
let clock: number;
let calls: { prompt: string; images: InlineImage[]; aspect: string }[];
let result: () => Promise<InlineImage>;

beforeEach(() => {
  r2 = fakeR2();
  env = { ANTHROPIC_API_KEY: "k", APP_PASSWORD: "p", GEMINI_API_KEY: "g", DB: fakeD1(), IMAGES: r2.bucket } as Env;
  clock = 10 * DAY;
  calls = [];
  result = async () => ({ mimeType: "image/png", data: PNG });
});

const client: ImageClient = {
  async generate(r) {
    calls.push(r);
    return result();
  },
};

async function api<T = unknown>(method: string, path = "", body?: unknown): Promise<{ status: number; json: T; res: Response }> {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const req = new Request(`https://app.test/api/images${path}`, init);
  const segments = path.split("?")[0].split("/").filter(Boolean);
  const res = await handleImages(req, env, segments, { now: () => clock, makeImageClient: () => client });
  const json = res.headers.get("content-type")?.includes("json") ? ((await res.clone().json()) as T) : (null as T);
  return { status: res.status, json, res };
}

const makePost = (channel = "Instagram caption", tool: "spread-the-magic" | "welcome-center" = "spread-the-magic") =>
  store.createDraft(
    env.DB,
    { tool, title: "post", request: { fields: { channel, topic: "Pool days" } }, content: POST, sources: [] },
    clock,
  );

const makeTrip = () =>
  store.createConversation(
    env.DB,
    {
      kind: "trip",
      title: "Testfam family",
      details: { lastName: "Testfam", destination: "Walt Disney World", dates: "March 14–20, 2027", party: "2 adults, kids 6 and 9" },
    },
    clock,
  );

function upload(owner: string, bytes: Uint8Array, type = "image/jpeg") {
  const form = new FormData();
  form.set("owner", owner);
  form.set("file", new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), "photo.jpg");
  return api<ImageMeta>("POST", "", form);
}

describe("uploading photos", () => {
  it("stores a photo for a post and lists it", async () => {
    const post = await makePost();
    const up = await upload(`draft:${post.id}`, JPEG());
    expect(up.status).toBe(201);
    expect(up.json).toMatchObject({ kind: "upload", shape: null, prompt: "" });
    expect(r2.objects.get(`images/${up.json.id}`)).toEqual(JPEG());

    const list = await api<ImageMeta[]>("GET", `?owner=draft:${post.id}`);
    expect(list.json.map((i) => i.id)).toEqual([up.json.id]);
  });

  it("only takes real JPEG, PNG or WebP photos under 5 MB", async () => {
    const post = await makePost();
    const pdf = await upload(`draft:${post.id}`, new TextEncoder().encode("%PDF-1.7 hello"), "image/jpeg");
    expect(pdf.status).toBe(400);
    expect(pdf.json).toEqual({ error: "That file isn't a photo — use a JPEG, PNG or WebP." });

    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(JPEG());
    const tooBig = await upload(`draft:${post.id}`, big);
    expect(tooBig.status).toBe(400);
    expect(tooBig.json).toEqual({ error: "That photo is too big — try a smaller one." });

    const webp = new Uint8Array([...new TextEncoder().encode("RIFF"), 1, 2, 3, 4, ...new TextEncoder().encode("WEBP")]);
    expect((await upload(`draft:${post.id}`, webp, "image/webp")).status).toBe(201);
    expect((await upload(`draft:${post.id}`, PNG, "image/png")).status).toBe(201);
    expect(r2.objects.size).toBe(2);
  });

  it("only adds photos to Spread the Magic posts and trips that exist", async () => {
    expect((await upload("draft:nope", JPEG())).status).toBe(404);
    const inquiry = await makePost("x", "welcome-center");
    expect((await upload(`draft:${inquiry.id}`, JPEG())).status).toBe(400);
    const chat = await store.createConversation(env.DB, { kind: "chat", title: "chat" }, clock);
    expect((await upload(`trip:${chat.id}`, JPEG())).status).toBe(400);
    expect((await upload("nonsense", JPEG())).status).toBe(400);
    expect(r2.objects.size).toBe(0);
  });
});

describe("making an image", () => {
  it("makes a post image from the post, her direction, her photos and the image rules", async () => {
    const post = await makePost();
    const a = await upload(`draft:${post.id}`, JPEG(1));
    const b = await upload(`draft:${post.id}`, JPEG(2));
    const made = await api<ImageMeta>("POST", "/generate", {
      owner: `draft:${post.id}`,
      direction: "Use our family photo by the pool, add the words 'Book by Dec 1'",
      photoIds: [b.json.id, a.json.id],
    });

    expect(made.status).toBe(201);
    expect(made.json).toMatchObject({ kind: "generated", shape: "portrait", prompt: "Use our family photo by the pool, add the words 'Book by Dec 1'" });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.aspect).toBe("4:5");
    expect(call.prompt).toContain("Pool day magic is calling!");
    expect(call.prompt).not.toContain("Compliance checklist");
    expect(call.prompt).toContain("Book by Dec 1");
    expect(call.prompt).toContain(BRAINS.images.split("\n").find((l) => l.startsWith("- Don't copy official logos"))!);
    expect(call.images.map((i) => i.data)).toEqual([JPEG(2), JPEG(1)]);
    expect(r2.objects.get(`images/${made.json.id}`)).toEqual(PNG);

    const row = await env.DB.prepare("SELECT model, cost_usd, mime FROM images WHERE id = ?").bind(made.json.id).first();
    expect(row).toEqual({ model: "gemini-nano-banana-2.1", cost_usd: 0.0336, mime: "image/png" });
  });

  it("uses the shape she picks", async () => {
    const post = await makePost();
    const made = await api<ImageMeta>("POST", "/generate", { owner: `draft:${post.id}`, direction: "", shape: "wide" });
    expect(made.status).toBe(201);
    expect(made.json.shape).toBe("wide");
    expect(calls[0].aspect).toBe("16:9");
    expect((await api("POST", "/generate", { owner: `draft:${post.id}`, shape: "huge" })).status).toBe(400);
  });

  it("makes a card for a trip from the trip details", async () => {
    const trip = await makeTrip();
    const made = await api<ImageMeta>("POST", "/generate", { owner: `trip:${trip.id}`, card: "countdown", direction: "30 days to go!" });
    expect(made.status).toBe(201);
    for (const text of ["Countdown", "Testfam family", "Walt Disney World", "March 14–20, 2027", "30 days to go!"]) {
      expect(calls[0].prompt).toContain(text);
    }
    expect(calls[0].aspect).toBe("4:5");
    expect((await api("POST", "/generate", { owner: `trip:${trip.id}`, direction: "hi" })).status).toBe(400);
  });

  it("blocks card numbers and hides emails in her direction", async () => {
    const post = await makePost();
    const blocked = await api("POST", "/generate", { owner: `draft:${post.id}`, direction: "Card 4111 1111 1111 1111" });
    expect(blocked.status).toBe(400);
    expect(blocked.json).toEqual({ error: SENSITIVE_MESSAGES.card });
    expect(calls).toHaveLength(0);

    const made = await api<ImageMeta>("POST", "/generate", { owner: `draft:${post.id}`, direction: "Thanks amy@example.com" });
    expect(calls[0].prompt).not.toContain("amy@example.com");
    expect(made.json.prompt).not.toContain("amy@example.com");
  });

  it("refuses photos from another post, too many photos, and editing a photo as if it were an image", async () => {
    const post = await makePost();
    const other = await makePost();
    const mine = await Promise.all([1, 2, 3, 4].map((n) => upload(`draft:${post.id}`, JPEG(n))));
    const theirs = await upload(`draft:${other.id}`, JPEG(9));
    const owner = `draft:${post.id}`;

    expect((await api("POST", "/generate", { owner, photoIds: [theirs.json.id] })).status).toBe(400);
    expect((await api("POST", "/generate", { owner, photoIds: mine.map((m) => m.json.id) })).status).toBe(400);
    expect((await api("POST", "/generate", { owner, baseImageId: mine[0].json.id })).status).toBe(400);
    expect((await api("POST", "/generate", { owner, direction: "x".repeat(1001) })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("changes an earlier image when asked", async () => {
    const post = await makePost();
    const first = await api<ImageMeta>("POST", "/generate", { owner: `draft:${post.id}`, direction: "A beach" });
    result = async () => ({ mimeType: "image/png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 2]) });
    const photo = await upload(`draft:${post.id}`, JPEG(5));
    await api<ImageMeta>("POST", "/generate", {
      owner: `draft:${post.id}`,
      direction: "Make the sky pinker",
      baseImageId: first.json.id,
      photoIds: [photo.json.id],
    });
    expect(calls[1].images.map((i) => i.data)).toEqual([PNG, JPEG(5)]);
    expect(calls[1].prompt).toContain("Change the first attached image");
    expect(calls[1].prompt).toContain("Make the sky pinker");
  });

  it("explains what went wrong and saves nothing", async () => {
    const post = await makePost();
    const cases: [Error, number, string][] = [
      [new ImageError("no-key"), 503, "Images aren't connected yet (Google API key)."],
      [new ImageError("billing"), 503, "Images need billing turned on in Google AI Studio."],
      [new ImageError("blocked"), 422, "Google wouldn't make that one — try describing it differently."],
      [new ImageError("busy"), 429, "It's busy right now — try again in a minute."],
      [new ImageError("failed"), 502, "No image came back — try again."],
      [new TypeError("fetch failed"), 502, "No image came back — try again."],
    ];
    for (const [err, status, message] of cases) {
      result = async () => {
        throw err;
      };
      const res = await api("POST", "/generate", { owner: `draft:${post.id}`, direction: "x" });
      expect(res.status).toBe(status);
      expect(res.json).toEqual({ error: message });
    }
    expect((await api<ImageMeta[]>("GET", `?owner=draft:${post.id}`)).json).toEqual([]);
    expect(r2.objects.size).toBe(0);
  });

  it("says why Google refused, in Google's words when it gives them", async () => {
    const post = await makePost();
    const cases: [ImageError, string][] = [
      [
        new ImageError("blocked", "IMAGE_SAFETY", "Unable to show the generated image."),
        `Google wouldn't make that one: its safety filter flagged the picture it was making. Google said: "Unable to show the generated image." Try describing it differently.`,
      ],
      [
        new ImageError("blocked", "IMAGE_RECITATION"),
        "Google wouldn't make that one: the picture came out too close to an existing image (copyright). Try describing it differently.",
      ],
      [new ImageError("blocked", "SOMETHING_NEW"), "Google wouldn't make that one: it gave the reason SOMETHING_NEW. Try describing it differently."],
    ];
    for (const [err, message] of cases) {
      result = async () => {
        throw err;
      };
      const res = await api("POST", "/generate", { owner: `draft:${post.id}`, direction: "x" });
      expect(res.status).toBe(422);
      expect(res.json).toEqual({ error: message });
    }
  });

  it("stops at 100 new images in 24 hours across the site", async () => {
    const post = await makePost();
    for (let i = 0; i < 100; i++) {
      await store.addImage(
        env.DB,
        { owner: { type: "draft", id: post.id }, kind: "generated", mime: "image/png", bytes: 1, shape: "square", prompt: "", model: "m", cost_usd: 0 },
        clock - (i < 5 ? DAY + 1 : 1000),
      );
    }
    // 95 within the last day: room for 5 more.
    for (let i = 0; i < 5; i++) expect((await api("POST", "/generate", { owner: `draft:${post.id}` })).status).toBe(201);
    const capped = await api("POST", "/generate", { owner: `draft:${post.id}` });
    expect(capped.status).toBe(429);
    expect(capped.json).toEqual({ error: "That's 100 images today — try again tomorrow." });
  });
});

describe("pictures for an itinerary", () => {
  const PLAN = {
    title: "The Testfam family's Disney week",
    intro: "Here's your plan.",
    days: [
      { title: "Day 1 — Arrival and pool", items: [{ time: null, text: "Check in, then the lazy river" }] },
      { title: "Day 2 — Magic Kingdom", items: [{ time: "9 AM", text: "Rope drop and the teacups" }] },
    ],
    tips: [],
    verifyNotes: [],
  };

  async function tripWithItinerary() {
    const trip = await makeTrip();
    const doc = await store.addDeliverable(env.DB, trip.id, "itinerary", PLAN, clock);
    return { trip, doc };
  }

  it("makes a wide picture of a family doing that day, kept out of the cards gallery", async () => {
    const { trip, doc } = await tripWithItinerary();
    const made = await api<ImageMeta>("POST", "/generate", { owner: `trip:${trip.id}`, deliverableId: doc.id, slot: 1 });
    expect(made.status).toBe(201);
    expect(made.json.shape).toBe("wide");
    expect(calls[0].aspect).toBe("16:9");
    for (const text of ["Day 2 — Magic Kingdom", "Rope drop and the teacups", "Walt Disney World", "2 adults, kids 6 and 9", "No words"]) {
      expect(calls[0].prompt).toContain(text);
    }
    expect((await api<ImageMeta[]>("GET", `?owner=trip:${trip.id}`)).json).toEqual([]);
  });

  it("makes a cover from the whole plan, with the family's own photos when chosen", async () => {
    const { trip, doc } = await tripWithItinerary();
    const family = await upload(`trip:${trip.id}`, JPEG(8));
    await api("POST", "/generate", { owner: `trip:${trip.id}`, deliverableId: doc.id, slot: "cover", photoIds: [family.json.id] });
    expect(calls[0].prompt).toContain("The Testfam family's Disney week");
    expect(calls[0].prompt).toContain("Day 1 — Arrival and pool");
    expect(calls[0].prompt).toContain("looking like themselves");
    expect(calls[0].images.map((i) => i.data)).toEqual([JPEG(8)]);
  });

  it("refuses a day that isn't there, another trip's itinerary, or a proposal", async () => {
    const { trip, doc } = await tripWithItinerary();
    const owner = `trip:${trip.id}`;
    expect((await api("POST", "/generate", { owner, deliverableId: doc.id, slot: 2 })).status).toBe(400);
    expect((await api("POST", "/generate", { owner, deliverableId: doc.id, slot: "back" })).status).toBe(400);
    const other = await makeTrip();
    const theirs = await store.addDeliverable(env.DB, other.id, "itinerary", PLAN, clock);
    expect((await api("POST", "/generate", { owner, deliverableId: theirs.id, slot: 0 })).status).toBe(400);
    const proposal = await store.addDeliverable(env.DB, trip.id, "proposal", { title: "x" }, clock);
    expect((await api("POST", "/generate", { owner, deliverableId: proposal.id, slot: 0 })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("standalone images (Picture Perfect)", () => {
  it("keeps photos and images that belong to no post or trip", async () => {
    const photo = await upload("library", JPEG(1));
    expect(photo.status).toBe(201);
    const post = await makePost();
    await upload(`draft:${post.id}`, JPEG(2));

    const made = await api<ImageMeta>("POST", "/generate", {
      owner: "library",
      direction: "A flyer background: a beach at sunrise, with the words 'Now booking 2027'",
      photoIds: [photo.json.id],
    });
    expect(made.status).toBe(201);
    expect(made.json.shape).toBe("portrait");
    expect(calls[0].prompt).toContain("Magical Moments Vacations");
    expect(calls[0].prompt).toContain("Now booking 2027");
    expect(calls[0].prompt).toContain(BRAINS.images.split("\n").find((l) => l.startsWith("- Don't copy official logos"))!);
    expect(calls[0].images.map((i) => i.data)).toEqual([JPEG(1)]);

    const list = await api<ImageMeta[]>("GET", "?owner=library");
    expect(list.json.map((i) => i.id).sort()).toEqual([photo.json.id, made.json.id].sort());
  });

  it("needs her words or a photo", async () => {
    const empty = await api("POST", "/generate", { owner: "library", direction: "   " });
    expect(empty.status).toBe(400);
    expect(empty.json).toEqual({ error: "Say what the image should show, or add a photo." });
    const photo = await upload("library", JPEG(3));
    expect((await api("POST", "/generate", { owner: "library", photoIds: [photo.json.id] })).status).toBe(201);
    expect(calls).toHaveLength(1);
  });

  it("never mixes library photos with a post's", async () => {
    const post = await makePost();
    const postPhoto = await upload(`draft:${post.id}`, JPEG(4));
    const libraryPhoto = await upload("library", JPEG(5));
    expect((await api("POST", "/generate", { owner: "library", direction: "x", photoIds: [postPhoto.json.id] })).status).toBe(400);
    expect((await api("POST", "/generate", { owner: `draft:${post.id}`, photoIds: [libraryPhoto.json.id] })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("keeps library images when a post is deleted", async () => {
    const post = await makePost();
    await upload(`draft:${post.id}`, JPEG(6));
    const kept = await upload("library", JPEG(7));
    await handleDrafts(new Request(`https://app.test/api/drafts/${post.id}`, { method: "DELETE" }), env, [post.id]);
    expect([...r2.objects.keys()]).toEqual([`images/${kept.json.id}`]);
  });
});

describe("viewing and deleting images", () => {
  it("serves an image privately and lets her delete it", async () => {
    const post = await makePost();
    const up = await upload(`draft:${post.id}`, JPEG());
    const got = await api("GET", `/${up.json.id}`);
    expect(got.status).toBe(200);
    expect(got.res.headers.get("content-type")).toBe("image/jpeg");
    expect(got.res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(new Uint8Array(await got.res.arrayBuffer())).toEqual(JPEG());
    expect((await api("GET", "/nope")).status).toBe(404);

    expect((await api("DELETE", `/${up.json.id}`)).json).toEqual({ ok: true });
    expect(r2.objects.size).toBe(0);
    expect((await api<ImageMeta[]>("GET", `?owner=draft:${post.id}`)).json).toEqual([]);
  });

  it("deleting a post deletes its photos and images", async () => {
    const post = await makePost();
    await upload(`draft:${post.id}`, JPEG());
    await api("POST", "/generate", { owner: `draft:${post.id}` });
    expect(r2.objects.size).toBe(2);

    const res = await handleDrafts(new Request(`https://app.test/api/drafts/${post.id}`, { method: "DELETE" }), env, [post.id]);
    expect(res.status).toBe(200);
    expect(r2.objects.size).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM images").first("n")).toBe(0);
  });

  it("deleting a trip deletes its cards and photos", async () => {
    const trip = await makeTrip();
    await upload(`trip:${trip.id}`, JPEG());
    await api("POST", "/generate", { owner: `trip:${trip.id}`, card: "welcome-home" });
    expect(r2.objects.size).toBe(2);

    const req = new Request(`https://app.test/api/conversations/${trip.id}`, { method: "DELETE" });
    expect((await handleConversations(req, env, [trip.id])).status).toBe(200);
    expect(r2.objects.size).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM images").first("n")).toBe(0);
  });
});
