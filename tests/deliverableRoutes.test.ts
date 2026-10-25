import { beforeEach, describe, expect, it } from "vitest";
import { handleConversations, type ConversationDeps } from "../worker/conversations";
import { handleDeliverable } from "../worker/deliverables";
import { extractFooter, extractSignature } from "../worker/prompt";
import { BRAINS } from "../worker/brains";
import { addDeliverable, appendMessages, createConversation, getDeliverable, listDeliverables, tryLock } from "../worker/store";
import { EventParser, type ServerEvent } from "../shared/sse";
import type { Itinerary, Proposal } from "../shared/deliverables";
import { fakeD1 } from "./helpers/fakeD1";
import { fakeClaude, textEvents, type Script } from "./helpers/fakeClaude";

let env: Env;
let pending: Promise<unknown>[];
beforeEach(() => {
  env = { ANTHROPIC_API_KEY: "test", APP_PASSWORD: "test", DB: fakeD1() } as Env;
  pending = [];
});

const ITINERARY: Itinerary = {
  title: "The Rivera family's Walt Disney World trip",
  intro: "Here's your day-by-day plan.",
  days: [{ title: "Day 1 — Arrival", items: [{ time: null, text: "Check in and swim" }] }],
  tips: [],
  verifyNotes: [],
};

function deps(...scripts: Script[]) {
  const fake = fakeClaude(...scripts);
  const d: ConversationDeps = { makeClient: fake.make, now: () => 5_000, keepaliveMs: 15_000, waitUntil: (p) => void pending.push(p) };
  return { fake, d };
}

/** A trip whose first message the server wrote (details plus the inquiry summary), then what Jillian typed. */
async function plannedTrip(jillianSays?: string) {
  const c = await createConversation(env.DB, { kind: "trip", title: "Rivera family", details: { lastName: "Rivera" } }, 1);
  const first = "**Client:** Rivera family\n**Travel dates:** June 14–20, 2027\n**From their inquiry:** Budget about $6,000.";
  await appendMessages(env.DB, c.id, [{ role: "user", content: first }, { role: "assistant", content: "### Day 1 — Arrival\nRest" }], 2);
  if (jillianSays) await appendMessages(env.DB, c.id, [{ role: "user", content: jillianSays }, { role: "assistant", content: "Noted." }], 3);
  return c;
}

async function generate(id: string, kind: string, d: ConversationDeps) {
  const req = new Request(`https://app.test/api/conversations/${id}/deliverables`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind }),
  });
  const res = await handleConversations(req, env, [id, "deliverables"], d);
  if (!res.headers.get("content-type")?.includes("event-stream")) return { res, events: [] as ServerEvent[] };
  const events = new EventParser().push(await res.text());
  await Promise.all(pending);
  return { res, events };
}

const json = (data: unknown) => textEvents(JSON.stringify(data).slice(0, 40), JSON.stringify(data).slice(40));

describe("generating a deliverable", () => {
  it("saves version 1 and reports it, without streaming the raw JSON", async () => {
    const c = await plannedTrip();
    const { fake, d } = deps({ events: json(ITINERARY) });
    const { events } = await generate(c.id, "itinerary", d);
    expect(events.map((e) => e.event)).toEqual(["deliverable", "done"]);
    expect(events[0]).toMatchObject({ event: "deliverable", data: { kind: "itinerary", version: 1 } });
    const saved = await listDeliverables(env.DB, c.id);
    expect(saved).toHaveLength(1);
    const params = fake.calls[0];
    expect(params.output_config).toMatchObject({ effort: "medium", format: { type: "json_schema" } });
    expect(params.tools).toBeUndefined();
    expect(JSON.stringify(params.messages)).toContain("itinerary");
  });

  it("keeps only the prices Jillian gave", async () => {
    const c = await plannedTrip("Pop Century is $4,200 for the week");
    const proposal: Proposal = {
      title: "Options",
      intro: "",
      options: [
        { name: "Pop Century", summary: "", highlights: [], bestFor: "", price: { amount: 4200, note: "" } },
        { name: "Polynesian", summary: "", highlights: [], bestFor: "", price: { amount: 9999, note: "" } },
      ],
      recommendation: "",
      nextSteps: [],
      verifyNotes: [],
    };
    const { events } = await generate(c.id, "proposal", deps({ events: json(proposal) }).d);
    const id = (events[0].data as { id: string }).id;
    const saved = (await getDeliverable(env.DB, id))?.data as Proposal;
    expect(saved.options.map((o) => o.price.amount)).toEqual([4200, null]);
  });

  it("doesn't take prices from the trip details, the inquiry summary or details-changed notes", async () => {
    const c = await plannedTrip();
    await appendMessages(
      env.DB,
      c.id,
      [
        { role: "user", content: "Trip details changed — use these from now on:\nWho's going: 2 adults, kids 9 and 12" },
        { role: "assistant", content: "Got it — I'll use the updated details from here on." },
      ],
      4,
    );
    const option = (name: string, amount: number) => ({ name, summary: "", highlights: [], bestFor: "", price: { amount, note: "" } });
    const proposal: Proposal = {
      title: "Options",
      intro: "",
      options: [option("Budget-sized", 6000), option("From the dates", 20), option("From the party", 12)],
      recommendation: "",
      nextSteps: [],
      verifyNotes: [],
    };
    const { events } = await generate(c.id, "proposal", deps({ events: json(proposal) }).d);
    const saved = (await getDeliverable(env.DB, (events[0].data as { id: string }).id))?.data as Proposal;
    expect(saved.options.map((o) => o.price.amount)).toEqual([null, null, null]);
  });

  it("reports a friendly error and saves nothing when the JSON doesn't fit", async () => {
    const c = await plannedTrip();
    const { events } = await generate(c.id, "itinerary", deps({ events: textEvents('{"title": "oops"}') }).d);
    expect(events.at(-1)).toEqual({ event: "error", data: { message: "That didn't come out right — try again." } });
    expect(await listDeliverables(env.DB, c.id)).toEqual([]);
    expect(await tryLock(env.DB, c.id, 6_000, 1_000)).toBe(true);
  });

  it("explains a refusal and saves nothing", async () => {
    const c = await plannedTrip();
    const { events } = await generate(c.id, "itinerary", deps({ final: { stop_reason: "refusal" } }).d);
    expect(events.at(-1)?.event).toBe("error");
    expect(await listDeliverables(env.DB, c.id)).toEqual([]);
  });

  it("needs a planned trip and a known kind", async () => {
    const unplanned = await createConversation(env.DB, { kind: "trip", title: "Nguyen family", details: { lastName: "Nguyen" } }, 1);
    expect((await generate(unplanned.id, "itinerary", deps().d)).res.status).toBe(400);
    const c = await plannedTrip();
    expect((await generate(c.id, "brochure", deps().d)).res.status).toBe(400);
    const chat = await createConversation(env.DB, { kind: "chat", title: "Hi" }, 1);
    expect((await generate(chat.id, "itinerary", deps().d)).res.status).toBe(400);
  });

  it("won't start while another reply is running", async () => {
    const c = await plannedTrip();
    await tryLock(env.DB, c.id, 5_000, 300_000);
    expect((await generate(c.id, "itinerary", deps({ events: json(ITINERARY) }).d)).res.status).toBe(409);
  });
});

describe("reading and editing a deliverable", () => {
  const call = (method: string, segments: string[], body?: unknown) =>
    handleDeliverable(
      new Request(`https://app.test/api/deliverables/${segments.join("/")}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      segments,
      () => 9_000,
    );

  it("returns the data with her signature and legal footer", async () => {
    const c = await plannedTrip();
    const { id } = await addDeliverable(env.DB, c.id, "itinerary", ITINERARY, 3);
    const res = await call("GET", [id]);
    const body = (await res.json()) as { kind: string; version: number; footer: string; signature: string };
    expect(body).toMatchObject({ kind: "itinerary", version: 1 });
    expect(body.footer).toContain("© Disney");
    expect(body.signature).toContain("Jillian Jochum");
  });

  it("saves Jillian's edits as the next version, exactly as she typed them", async () => {
    const c = await plannedTrip();
    const { id } = await addDeliverable(env.DB, c.id, "itinerary", ITINERARY, 3);
    const edited = { ...ITINERARY, intro: "Can't wait for your trip!" };
    const res = await call("POST", [id, "edit"], { data: edited });
    const saved = (await res.json()) as { id: string; version: number };
    expect(saved.version).toBe(2);
    expect((await getDeliverable(env.DB, saved.id))?.data).toEqual(edited);
  });

  it("rejects an edit that breaks the shape", async () => {
    const c = await plannedTrip();
    const { id } = await addDeliverable(env.DB, c.id, "itinerary", ITINERARY, 3);
    expect((await call("POST", [id, "edit"], { data: { title: "" } })).status).toBe(400);
  });

  it("returns 404 for an unknown deliverable", async () => {
    expect((await call("GET", ["nope"])).status).toBe(404);
  });
});

describe("brand pieces from the brains", () => {
  it("pulls the exact legal footer", () => {
    expect(extractFooter(BRAINS["reference/compliance"])).toMatch(/^As to Disney artwork, logos, and properties: © Disney\..*Universal Destinations & Experiences\.$/);
  });

  it("pulls her signature block", () => {
    expect(extractSignature(BRAINS["reference/voice"])).toBe("Jillian Jochum\nMagical Moments Vacations\njillian.jochum@mmvagent.com");
  });
});
