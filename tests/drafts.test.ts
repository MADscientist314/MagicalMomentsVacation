import { beforeEach, describe, expect, it } from "vitest";
import { draftTitle, type SavedDraft, type SavedDraftMeta } from "../shared/drafts";
import { handleDrafts } from "../worker/drafts";
import { fakeD1 } from "./helpers/fakeD1";

let env: Env;
let clock: number;
beforeEach(() => {
  env = { ANTHROPIC_API_KEY: "k", APP_PASSWORD: "p", DB: fakeD1() } as Env;
  clock = 1_000;
});

async function api<T = unknown>(method: string, path = "", body?: unknown): Promise<{ status: number; json: T }> {
  const url = `https://app.test/api/drafts${path}`;
  const req = new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const segments = path.split("?")[0].split("/").filter(Boolean);
  const res = await handleDrafts(req, env, segments, () => clock++);
  return { status: res.status, json: (await res.json()) as T };
}

const INQUIRY_REPLY = "Hi Dana!\n\n## For Jillian only\n**Trip hand-off**\n- Client last name: Whitfield\n- Destination: Walt Disney World";

const saveInquiry = (inquiry = "Dana Whitfield wants Disney in March") =>
  api<SavedDraft>("POST", "", { tool: "welcome-center", request: { fields: { inquiry } }, content: INQUIRY_REPLY, sources: [] });

describe("draftTitle", () => {
  it("names a Welcome Center review after the family", () => {
    expect(draftTitle("welcome-center", { inquiry: "x" }, INQUIRY_REPLY)).toBe("Whitfield family inquiry");
  });

  it("falls back to the inquiry's first line without a hand-off", () => {
    expect(draftTitle("welcome-center", { inquiry: "\n  Hi, we want a cruise\nmore" }, "Hi!")).toBe("Hi, we want a cruise");
  });

  it("names Inbox Helper replies after the people", () => {
    const content = "### Reply to Maria — Final payment\nHi\n\n### Reply to Kevin – Dining\nHi\n\n## For Jillian only\nToday";
    expect(draftTitle("inbox-helper", { emails: "From: Maria" }, content)).toBe("Replies to Maria, Kevin");
  });

  it("names a quick-start email after its kind and the client", () => {
    const content = "### Email to Katie — Payment reminder\nHi Katie\n\n## For Jillian only\nVerify the date";
    expect(draftTitle("inbox-helper", { need: "Payment reminder", emails: "Katie, Universal, June" }, content)).toBe(
      "Payment reminder — Katie",
    );
  });

  it("names posts and emails from their fields", () => {
    expect(draftTitle("spread-the-magic", { channel: "Facebook post", topic: "Disney cruise deals" }, "x")).toBe("Facebook post: Disney cruise deals");
    expect(draftTitle("magic-mail", { clientNames: "The Riveras", emailType: "Welcome" }, "x")).toBe("The Riveras — Welcome");
  });
});

describe("saved drafts API", () => {
  it("saves a draft with a recognizable name and lists it for its tool only", async () => {
    const created = await saveInquiry();
    expect(created.status).toBe(201);
    expect(created.json.title).toBe("Whitfield family inquiry");
    await api("POST", "", { tool: "spread-the-magic", request: { fields: { channel: "Facebook post", topic: "Cruises" } }, content: "Post!", sources: [] });
    const list = await api<SavedDraftMeta[]>("GET", "?tool=welcome-center");
    expect(list.json.map((d) => d.title)).toEqual(["Whitfield family inquiry"]);
  });

  it("reopens a saved draft with the request behind it, so it can be refined further", async () => {
    const { json } = await saveInquiry();
    const opened = await api<SavedDraft>("GET", `/${json.id}`);
    expect(opened.json.request.fields.inquiry).toBe("Dana Whitfield wants Disney in March");
    expect(opened.json.content).toBe(INQUIRY_REPLY);
  });

  it("masks contact details and refuses card numbers before saving", async () => {
    const masked = await saveInquiry("Dana, dana@example.com, 555-201-3344");
    expect(JSON.stringify(masked.json)).not.toMatch(/example\.com|555-201/);
    const blocked = await saveInquiry("Card 4111 1111 1111 1111");
    expect(blocked.status).toBe(400);
    expect((await api<SavedDraftMeta[]>("GET", "?tool=welcome-center")).json).toHaveLength(1);
  });

  it("updates the same draft after a refine, and marks Inbox Helper work as handled", async () => {
    const { json } = await api<SavedDraft>("POST", "", {
      tool: "inbox-helper",
      request: { fields: { emails: "From: Maria" } },
      content: "### Reply to Maria — Payment\nHi",
      sources: [],
    });
    const refined = await api<SavedDraft>("PATCH", `/${json.id}`, {
      request: { fields: { emails: "From: Maria" }, refinements: [{ draft: "### Reply to Maria — Payment\nHi", request: "Shorter" }] },
      content: "### Reply to Maria — Payment\nHi!",
    });
    expect(refined.json.content).toBe("### Reply to Maria — Payment\nHi!");
    expect(refined.json.request.refinements).toHaveLength(1);
    await api("PATCH", `/${json.id}`, { handled: true });
    const [item] = (await api<SavedDraftMeta[]>("GET", "?tool=inbox-helper")).json;
    expect(item.handled).toBe(true);
  });

  it("lists to-do items before handled ones, newest first", async () => {
    const save = (who: string) =>
      api<SavedDraft>("POST", "", { tool: "inbox-helper", request: { fields: { emails: who } }, content: `### Reply to ${who} — x\nHi`, sources: [] });
    const a = (await save("Ann")).json;
    await save("Ben");
    await save("Cam");
    await api("PATCH", `/${a.id}`, { handled: false });
    const cam = (await api<SavedDraftMeta[]>("GET", "?tool=inbox-helper")).json[0];
    await api("PATCH", `/${cam.id}`, { handled: true });
    const titles = (await api<SavedDraftMeta[]>("GET", "?tool=inbox-helper")).json.map((d) => d.title);
    expect(titles).toEqual(["Replies to Ben", "Replies to Ann", "Replies to Cam"]);
  });

  it("deletes a draft", async () => {
    const { json } = await saveInquiry();
    expect((await api("DELETE", `/${json.id}`)).status).toBe(200);
    expect((await api("GET", `/${json.id}`)).status).toBe(404);
  });

  it("rejects unknown tools, trips, and empty or oversized drafts", async () => {
    expect((await api("GET", "?tool=nope")).status).toBe(400);
    expect((await api("POST", "", { tool: "adventure-planner", request: { fields: {} }, content: "x", sources: [] })).status).toBe(400);
    expect((await api("POST", "", { tool: "welcome-center", request: { fields: { inquiry: "x" } }, content: "", sources: [] })).status).toBe(400);
    expect(
      (await api("POST", "", { tool: "welcome-center", request: { fields: { inquiry: "x" } }, content: "y".repeat(100_001), sources: [] })).status,
    ).toBe(400);
  });
});
