import { beforeEach, describe, expect, it } from "vitest";
import { handleConversations, type ConversationDeps } from "../worker/conversations";
import { appendMessages, createConversation, getConversation, getMessages, releaseLock, tryLock } from "../worker/store";
import { EventParser, type ServerEvent } from "../shared/sse";
import { fakeD1 } from "./helpers/fakeD1";
import { fakeClaude, textEvents, type Script } from "./helpers/fakeClaude";

let env: Env;
let pending: Promise<unknown>[];

beforeEach(() => {
  env = { ANTHROPIC_API_KEY: "test", APP_PASSWORD: "test", DB: fakeD1() } as Env;
  pending = [];
});

function deps(...scripts: Script[]) {
  const fake = fakeClaude(...scripts);
  const d: ConversationDeps = { makeClient: fake.make, now: () => 1_000_000, keepaliveMs: 15_000, waitUntil: (p) => void pending.push(p) };
  return { fake, d };
}

async function api(method: string, path: string, body?: unknown, d: ConversationDeps = deps().d) {
  const url = `https://app.test/api/conversations${path}`;
  const req = new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const segments = path.split("?")[0].split("/").filter(Boolean);
  return handleConversations(req, env, segments, d);
}

async function events(res: Response): Promise<ServerEvent[]> {
  const out = new EventParser().push(await res.text());
  await Promise.all(pending);
  return out;
}

const TRIP = { lastName: "Rivera", destination: "Walt Disney World", dates: "June 8–14, 2027", party: "2 adults, kids 6 and 9" };

async function newTrip(details: Record<string, string> = TRIP) {
  const res = await api("POST", "", { kind: "trip", details });
  return ((await res.json()) as { id: string }).id;
}

describe("creating and listing", () => {
  it("masks contact details in a long chat title before cutting it short", async () => {
    const title = `${"x".repeat(105)} write to jane.doe@example.com or 555-201-3344`;
    const created = (await (await api("POST", "", { kind: "chat", title })).json()) as { title: string };
    expect(created.title).not.toMatch(/jane|555|example/);
    expect(created.title.length).toBeLessThanOrEqual(120);
  });

  it("creates a trip titled by the family name", async () => {
    const res = await api("POST", "", { kind: "trip", details: TRIP });
    expect(res.status).toBe(201);
    const trip = (await res.json()) as { title: string; details: Record<string, string> };
    expect(trip.title).toBe("Rivera family");
    expect(trip.details.destination).toBe("Walt Disney World");
  });

  it("masks contact details and blocks card numbers in trip details", async () => {
    const masked = await api("POST", "", { kind: "trip", details: { ...TRIP, priorities: "Email amy@example.com" } });
    expect(((await masked.json()) as { details: Record<string, string> }).details.priorities).toBe("Email [email]");
    const blocked = await api("POST", "", { kind: "trip", details: { ...TRIP, priorities: "Card 4111 1111 1111 1111" } });
    expect(blocked.status).toBe(400);
    const list = (await (await api("GET", "?kind=trip")).json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("requires a last name for trips", async () => {
    expect((await api("POST", "", { kind: "trip", details: { destination: "Walt Disney World" } })).status).toBe(400);
  });

  it("pins, lists and deletes", async () => {
    const a = await newTrip();
    await newTrip({ ...TRIP, lastName: "Nguyen" });
    await api("PATCH", `/${a}`, { pinned: true });
    const list = (await (await api("GET", "?kind=trip")).json()) as { id: string; pinned: boolean }[];
    expect(list[0]).toMatchObject({ id: a, pinned: true });
    expect((await api("DELETE", `/${a}`)).status).toBe(200);
    expect((await api("GET", `/${a}`)).status).toBe(404);
  });
});

describe("Plan it", () => {
  it("builds the first message on the server and saves both sides when done", async () => {
    const id = await newTrip({ ...TRIP, summary: "First trip, birthday on day 3" });
    const { fake, d } = deps({ events: textEvents("### Day 1 — Arrival\n", "Rest") });
    const evs = await events(await api("POST", `/${id}/plan`, {}, d));
    expect(evs.at(-1)?.event).toBe("done");
    const sent = JSON.stringify(fake.calls[0].messages);
    expect(sent).toContain("Walt Disney World");
    expect(sent).toContain("Rivera");
    expect(sent).toContain("birthday on day 3");
    expect(fake.calls[0].output_config?.effort).toBe("high");
    const saved = await getMessages(env.DB, id);
    expect(saved.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(saved[1].content).toBe("### Day 1 — Arrival\nRest");
  });

  it("won't plan the same trip twice", async () => {
    const id = await newTrip();
    await events(await api("POST", `/${id}/plan`, {}, deps({ events: textEvents("Plan") }).d));
    expect((await api("POST", `/${id}/plan`, {}, deps({ events: textEvents("Again") }).d)).status).toBe(409);
  });

  it("refuses a second reply while one is still running", async () => {
    const id = await newTrip();
    await tryLock(env.DB, id, 1_000_000, 300_000);
    const { fake, d } = deps({ events: textEvents("Plan") });
    expect((await api("POST", `/${id}/plan`, {}, d)).status).toBe(409);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("sending messages", () => {
  async function plannedTrip() {
    const id = await newTrip();
    await appendMessages(env.DB, id, [
      { role: "user", content: "Plan the Rivera trip" },
      { role: "assistant", content: "### Day 1 — Arrival\nRest" },
    ], 1);
    return id;
  }

  it("sends the saved history plus the new message, then saves the reply", async () => {
    const id = await plannedTrip();
    const { fake, d } = deps({ events: textEvents("Updated plan") });
    await events(await api("POST", `/${id}/messages`, { content: "Add a character breakfast" }, d));
    const roles = fake.calls[0].messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user"]);
    expect((await getMessages(env.DB, id)).map((m) => m.content)).toEqual([
      "Plan the Rivera trip",
      "### Day 1 — Arrival\nRest",
      "Add a character breakfast",
      "Updated plan",
    ]);
  });

  it("starts a chat with its first message", async () => {
    const created = (await (await api("POST", "", { kind: "chat", title: "What's new at EPCOT?" })).json()) as { id: string };
    const { fake, d } = deps({ events: textEvents("Lots!") });
    await events(await api("POST", `/${created.id}/messages`, { content: "What's new at EPCOT?" }, d));
    expect(JSON.stringify(fake.calls[0].system)).toContain("Chat with Jillian");
    expect(fake.calls[0].tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 5 }]);
    expect(await getMessages(env.DB, created.id)).toHaveLength(2);
  });

  it("lets trip replies search up to 20 times (chats stay at 5)", async () => {
    const id = await plannedTrip();
    const { fake, d } = deps({ events: textEvents("Sure") });
    await events(await api("POST", `/${id}/messages`, { content: "Add a pool day" }, d));
    expect(fake.calls[0].tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 20 }]);
  });

  it("asks for Plan it before chatting about an unplanned trip", async () => {
    const id = await newTrip();
    expect((await api("POST", `/${id}/messages`, { content: "Hi" })).status).toBe(400);
  });

  it("blocks a card number without saving or calling Claude", async () => {
    const id = await plannedTrip();
    const { fake, d } = deps({ events: textEvents("x") });
    const res = await api("POST", `/${id}/messages`, { content: "Her card is 4111 1111 1111 1111" }, d);
    expect(res.status).toBe(400);
    expect(fake.calls).toHaveLength(0);
    expect(await getMessages(env.DB, id)).toHaveLength(2);
  });

  it("stores contact details masked", async () => {
    const id = await plannedTrip();
    await events(await api("POST", `/${id}/messages`, { content: "Send it to amy@example.com" }, deps({ events: textEvents("ok") }).d));
    expect((await getMessages(env.DB, id))[2].content).toBe("Send it to [email]");
  });

  it("rejects an over-long message and a very long conversation", async () => {
    const id = await plannedTrip();
    expect((await api("POST", `/${id}/messages`, { content: "x".repeat(4001) })).status).toBe(400);
    await appendMessages(env.DB, id, [{ role: "user", content: "y".repeat(100_000) }, { role: "assistant", content: "z".repeat(100_000) }], 2);
    expect((await api("POST", `/${id}/messages`, { content: "more" })).status).toBe(413);
  });

  it("saves nothing when Claude refuses, and frees the conversation", async () => {
    const id = await plannedTrip();
    const evs = await events(await api("POST", `/${id}/messages`, { content: "Hmm" }, deps({ events: textEvents("I"), final: { stop_reason: "refusal" } }).d));
    expect(evs.at(-1)).toEqual({ event: "error", data: { message: "I can't help with that one — try rewording." } });
    expect(await getMessages(env.DB, id)).toHaveLength(2);
    expect(await tryLock(env.DB, id, 1_000_001, 300_000)).toBe(true);
  });

  it("reports an empty reply as an error instead of done", async () => {
    const id = await plannedTrip();
    const evs = await events(await api("POST", `/${id}/messages`, { content: "Hmm" }, deps({ events: [] }).d));
    expect(evs.at(-1)).toEqual({ event: "error", data: { message: "Something went wrong — try again." } });
    expect(await getMessages(env.DB, id)).toHaveLength(2);
  });

  it("saves nothing when the call fails midway, and frees the conversation", async () => {
    const id = await plannedTrip();
    const evs = await events(await api("POST", `/${id}/messages`, { content: "Hmm" }, deps({ events: textEvents("Half"), error: new Error("boom") }).d));
    expect(evs.at(-1)?.event).toBe("error");
    expect(await getMessages(env.DB, id)).toHaveLength(2);
    expect(await tryLock(env.DB, id, 1_000_001, 300_000)).toBe(true);
  });

  it("saves the whole reply across a paused turn", async () => {
    const id = await plannedTrip();
    const paused = [{ type: "text", text: "Part one", citations: null }];
    const d = deps(
      { events: textEvents("Part one"), final: { stop_reason: "pause_turn", content: paused as never } },
      { events: textEvents(" and two") },
    ).d;
    await events(await api("POST", `/${id}/messages`, { content: "Go" }, d));
    expect((await getMessages(env.DB, id)).at(-1)?.content).toBe("Part one and two");
  });

  it("reports an error instead of done when the reply can't be saved", async () => {
    const id = await plannedTrip();
    const realBatch = env.DB.batch.bind(env.DB);
    env.DB.batch = (async () => {
      throw new Error("disk full");
    }) as typeof env.DB.batch;
    const evs = await events(await api("POST", `/${id}/messages`, { content: "Go" }, deps({ events: textEvents("Reply") }).d));
    env.DB.batch = realBatch;
    expect(evs.map((e) => e.event)).not.toContain("done");
    expect(evs.at(-1)?.event).toBe("error");
  });
});

describe("editing trip details after planning", () => {
  it("adds a note to the conversation so the next reply uses the new details", async () => {
    const id = await newTrip();
    await appendMessages(env.DB, id, [{ role: "user", content: "Plan it" }, { role: "assistant", content: "Plan" }], 1);
    await api("PATCH", `/${id}`, { details: { ...TRIP, dates: "July 1–7, 2027" } });
    const msgs = await getMessages(env.DB, id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(msgs[2].content).toContain("July 1–7, 2027");
  });

  it("won't change details while a reply is running, and frees the trip afterwards", async () => {
    const id = await newTrip();
    await appendMessages(env.DB, id, [{ role: "user", content: "Plan it" }, { role: "assistant", content: "Plan" }], 1);
    await tryLock(env.DB, id, 1_000_000, 300_000);
    expect((await api("PATCH", `/${id}`, { details: { ...TRIP, dates: "July" } })).status).toBe(409);
    expect((await getConversation(env.DB, id))?.details.dates).toBe(TRIP.dates);
    expect(await getMessages(env.DB, id)).toHaveLength(2);
    await releaseLock(env.DB, id);
    expect((await api("PATCH", `/${id}`, { details: { ...TRIP, dates: "July" } })).status).toBe(200);
    expect(await tryLock(env.DB, id, 1_000_001, 300_000)).toBe(true);
  });

  it("still pins while a reply is running", async () => {
    const id = await newTrip();
    await appendMessages(env.DB, id, [{ role: "user", content: "Plan it" }, { role: "assistant", content: "Plan" }], 1);
    await tryLock(env.DB, id, 1_000_000, 300_000);
    expect((await api("PATCH", `/${id}`, { pinned: true })).status).toBe(200);
  });

  it("just saves the details when nothing is planned yet", async () => {
    const id = await newTrip();
    await api("PATCH", `/${id}`, { details: { ...TRIP, dates: "July" } });
    expect(await getMessages(env.DB, id)).toEqual([]);
  });

  it("returns 404 for an unknown trip", async () => {
    const c = await createConversation(env.DB, { kind: "chat", title: "x" }, 1);
    expect((await api("GET", `/${c.id}x`)).status).toBe(404);
  });
});
