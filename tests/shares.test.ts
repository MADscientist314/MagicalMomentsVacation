import { beforeEach, describe, expect, it } from "vitest";
import type { Itinerary } from "../shared/deliverables";
import { SHARE_MS, type ShareInfo } from "../shared/shares";
import { handleDeliverable } from "../worker/deliverables";
import worker from "../worker/index";
import { handleSharePage } from "../worker/shares";
import * as store from "../worker/store";
import { fakeD1 } from "./helpers/fakeD1";
import { fakeR2 } from "./helpers/fakeR2";

const DAY = 24 * 60 * 60_000;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

let env: Env;
let clock: number;
beforeEach(() => {
  env = { ANTHROPIC_API_KEY: "k", APP_PASSWORD: "test-magic-words", DB: fakeD1(), IMAGES: fakeR2().bucket } as Env;
  clock = 100 * DAY;
});

const PLAN: Itinerary = {
  title: "The Rivera family's <Disney> week",
  intro: "Here's your plan.",
  days: [{ title: "Day 1 — Arrival", items: [{ time: null, text: "Check in and swim" }] }],
  tips: [],
  verifyNotes: ["Check the pool refurb dates"],
};

async function trip() {
  const c = await store.createConversation(env.DB, { kind: "trip", title: "Rivera family", details: { lastName: "Rivera" } }, 1);
  const v1 = await store.addDeliverable(env.DB, c.id, "itinerary", PLAN, 2);
  return { c, v1 };
}

const api = (method: string, id: string, action?: string) =>
  handleDeliverable(new Request(`https://app.test/api/deliverables/${id}${action ? `/${action}` : ""}`, { method }), env, action ? [id, action] : [id], () => clock);

const share = async (id: string) => (await (await api("POST", id, "share")).json()) as ShareInfo;
const page = (path: string, method = "GET") =>
  handleSharePage(new Request(`https://app.test${path}`, { method }), env, path.split("/").slice(2).filter(Boolean), clock);

describe("sharing a document as a link", () => {
  it("makes an unguessable link that works for 30 days, and shows it with the document", async () => {
    const { v1 } = await trip();
    const s = await share(v1.id);
    expect(s.path).toMatch(/^\/p\/[A-Za-z0-9_-]{32}$/);
    expect(s).toMatchObject({ deliverableId: v1.id, version: 1, expiresAt: clock + SHARE_MS });
    const doc = (await (await api("GET", v1.id)).json()) as { share: ShareInfo };
    expect(doc.share).toEqual(s);
  });

  it("moves the same link to a newer version, so the family's link stays the same", async () => {
    const { c, v1 } = await trip();
    const first = await share(v1.id);
    const v2 = await store.addDeliverable(env.DB, c.id, "itinerary", { ...PLAN, intro: "Updated plan." }, 3);
    clock += 5 * DAY;
    const moved = await share(v2.id);
    expect(moved.path).toBe(first.path);
    expect(moved).toMatchObject({ deliverableId: v2.id, version: 2, expiresAt: clock + SHARE_MS });
    expect(await (await page(moved.path)).text()).toContain("Updated plan.");
    // Looking at the older version still says which version the family sees.
    expect(((await (await api("GET", v1.id)).json()) as { share: ShareInfo }).share.version).toBe(2);
  });

  it("gives each kind of document its own link", async () => {
    const { c, v1 } = await trip();
    const extras = await store.addDeliverable(env.DB, c.id, "extras", { title: "Extras", intro: "", sections: [{ heading: "Packing list", checklist: ["Hats"] }], verifyNotes: [] }, 3);
    expect((await share(extras.id)).path).not.toBe((await share(v1.id)).path);
  });

  it("stops working when she stops sharing, and when the trip is deleted", async () => {
    const { c, v1 } = await trip();
    const s = await share(v1.id);
    expect((await api("DELETE", v1.id, "share")).status).toBe(200);
    expect((await page(s.path)).status).toBe(404);
    expect(((await (await api("GET", v1.id)).json()) as { share: unknown }).share).toBeNull();

    const again = await share(v1.id);
    expect(again.path).not.toBe(s.path);
    await store.deleteConversation(env.DB, c.id);
    expect((await page(again.path)).status).toBe(404);
  });
});

describe("the family's page", () => {
  it("shows the client copy, kept out of search engines, with a Print button and no other scripts", async () => {
    const { v1 } = await trip();
    const s = await share(v1.id);
    const res = await page(s.path);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("The Rivera family&#39;s &lt;Disney&gt; week");
    expect(html).toContain("Check in and swim");
    expect(html).not.toContain("Check the pool refurb dates");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain("Print or save as PDF");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const policy = res.headers.get("content-security-policy")!;
    const nonce = /script-src 'nonce-([a-f0-9]+)'/.exec(policy)![1];
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("says when a link has run out, or isn't one", async () => {
    const { v1 } = await trip();
    const s = await share(v1.id);
    clock += SHARE_MS + 1;
    const expired = await page(s.path);
    expect(expired.status).toBe(410);
    expect(await expired.text()).toContain("This trip page has expired");
    expect((await page("/p/not-a-real-token")).status).toBe(404);
    expect((await page(`/p/${"x".repeat(32)}`)).status).toBe(404);
    clock -= SHARE_MS;
    expect((await page(s.path, "POST")).status).toBe(405);
  });

  it("serves only the pictures placed in the shared document", async () => {
    const { c } = await trip();
    const owner = { type: "trip", id: c.id } as const;
    const cover = await store.addImage(env.DB, { owner, kind: "upload", mime: "image/jpeg", bytes: JPEG.length, shape: null, prompt: "", model: null, cost_usd: 0 }, 3, "11111111-1111-4111-8111-111111111111");
    const other = await store.addImage(env.DB, { owner, kind: "upload", mime: "image/jpeg", bytes: JPEG.length, shape: null, prompt: "", model: null, cost_usd: 0 }, 3, "22222222-2222-4222-8222-222222222222");
    await env.IMAGES.put(`images/${cover.id}`, JPEG);
    await env.IMAGES.put(`images/${other.id}`, JPEG);
    const withCover = await store.addDeliverable(env.DB, c.id, "itinerary", { ...PLAN, coverPhoto: cover.id }, 4);
    const s = await share(withCover.id);

    expect(await (await page(s.path)).text()).toContain(`src="${s.path}/${cover.id}"`);
    const picture = await page(`${s.path}/${cover.id}`);
    expect(picture.status).toBe(200);
    expect(picture.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await picture.arrayBuffer())).toEqual(JPEG);
    expect((await page(`${s.path}/${other.id}`)).status).toBe(404);
  });

  it("needs no sign-in, while the rest of the app still does", async () => {
    const { v1 } = await trip();
    const s = await share(v1.id);
    const call = (path: string) => worker.fetch(new Request(`https://app.test${path}`), env, CTX);
    // The Worker reads the real clock, so give the link a far-off expiry.
    await env.DB.prepare("UPDATE shares SET expires_at = ?").bind(Date.now() + DAY).run();
    expect((await call(s.path)).status).toBe(200);
    expect((await call(`/api/deliverables/${v1.id}`)).status).toBe(401);
    expect((await call(`/api/deliverables/${v1.id}/share`)).status).toBe(401);
  });
});
