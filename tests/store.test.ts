import { beforeEach, describe, expect, it } from "vitest";
import { fakeD1 } from "./helpers/fakeD1";
import {
  addDeliverable,
  appendMessages,
  createConversation,
  deleteConversation,
  forgetLoginAttempt,
  getConversation,
  getDeliverable,
  getMessages,
  listConversations,
  listDeliverables,
  recordLoginAttempt,
  releaseLock,
  tryLock,
  updateConversation,
} from "../worker/store";

let db: D1Database;
beforeEach(() => {
  db = fakeD1();
});

describe("conversations", () => {
  it("lists pinned trips first, then the most recently updated", async () => {
    const a = await createConversation(db, { kind: "trip", title: "Rivera family", details: { lastName: "Rivera" } }, 1000);
    const b = await createConversation(db, { kind: "trip", title: "Nguyen family" }, 2000);
    await createConversation(db, { kind: "chat", title: "What's new at EPCOT?" }, 3000);
    await updateConversation(db, a.id, { pinned: true }, 1500);
    const trips = await listConversations(db, "trip");
    expect(trips.map((t) => t.title)).toEqual(["Rivera family", "Nguyen family"]);
    expect(trips[0].pinned).toBe(true);
    expect(trips[0].details).toEqual({ lastName: "Rivera" });
    expect(trips.find((t) => t.id === b.id)?.pinned).toBe(false);
  });

  it("returns null for an unknown id", async () => {
    expect(await getConversation(db, "nope")).toBeNull();
  });

  it("deletes a conversation with its messages and deliverables", async () => {
    const c = await createConversation(db, { kind: "trip", title: "Rivera family" }, 1);
    await appendMessages(db, c.id, [{ role: "user", content: "Plan it" }], 2);
    await addDeliverable(db, c.id, "itinerary", { title: "x" }, 3);
    expect(await deleteConversation(db, c.id)).toBe(true);
    expect(await getMessages(db, c.id)).toEqual([]);
    expect(await listDeliverables(db, c.id)).toEqual([]);
    expect(await deleteConversation(db, c.id)).toBe(false);
  });
});

describe("messages", () => {
  it("numbers messages in order and bumps the conversation's updated time", async () => {
    const c = await createConversation(db, { kind: "chat", title: "Hi" }, 1);
    await appendMessages(db, c.id, [{ role: "user", content: "One" }, { role: "assistant", content: "Two", sources: [{ title: "T", url: "https://t.test" }] }], 50);
    await appendMessages(db, c.id, [{ role: "user", content: "Three" }], 60);
    const messages = await getMessages(db, c.id);
    expect(messages.map((m) => [m.seq, m.role, m.content])).toEqual([
      [1, "user", "One"],
      [2, "assistant", "Two"],
      [3, "user", "Three"],
    ]);
    expect(messages[1].sources).toEqual([{ title: "T", url: "https://t.test" }]);
    expect((await getConversation(db, c.id))?.updated_at).toBe(60);
  });
});

describe("busy lock", () => {
  it("lets only one reply run at a time until it's released or expires", async () => {
    const c = await createConversation(db, { kind: "trip", title: "Rivera family" }, 1);
    expect(await tryLock(db, c.id, 1000, 300_000)).toBe(true);
    expect(await tryLock(db, c.id, 2000, 300_000)).toBe(false);
    expect(await tryLock(db, c.id, 400_000, 300_000)).toBe(true);
    await releaseLock(db, c.id);
    expect(await tryLock(db, c.id, 400_001, 300_000)).toBe(true);
  });
});

describe("deliverables", () => {
  it("versions each kind separately", async () => {
    const c = await createConversation(db, { kind: "trip", title: "Rivera family" }, 1);
    const p1 = await addDeliverable(db, c.id, "proposal", { title: "P1" }, 10);
    const p2 = await addDeliverable(db, c.id, "proposal", { title: "P2" }, 20);
    const i1 = await addDeliverable(db, c.id, "itinerary", { title: "I1" }, 30);
    expect([p1.version, p2.version, i1.version]).toEqual([1, 2, 1]);
    expect((await getDeliverable(db, p2.id))?.data).toEqual({ title: "P2" });
    expect((await listDeliverables(db, c.id)).map((d) => `${d.kind} v${d.version}`)).toEqual([
      "itinerary v1",
      "proposal v2",
      "proposal v1",
    ]);
  });
});

describe("login attempts", () => {
  it("counts this attempt plus recent ones from the same address", async () => {
    await recordLoginAttempt(db, "1.2.3.4", 1000, 0);
    await recordLoginAttempt(db, "5.6.7.8", 5000, 2000);
    expect((await recordLoginAttempt(db, "1.2.3.4", 5000, 2000)).count).toBe(1);
    expect((await recordLoginAttempt(db, "1.2.3.4", 6000, 2000)).count).toBe(2);
  });

  it("forgets an attempt that turned out to be a successful sign-in", async () => {
    const first = await recordLoginAttempt(db, "1.2.3.4", 1000, 0);
    await forgetLoginAttempt(db, first.id);
    expect((await recordLoginAttempt(db, "1.2.3.4", 2000, 0)).count).toBe(1);
  });
});
