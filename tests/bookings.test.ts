import { beforeEach, describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  defaultReminders,
  formatDay,
  fromToday,
  guessTripDays,
  isDay,
  MAX_KEY_DATES,
  type ActiveTrip,
  type Booking,
  type KeyDate,
} from "../shared/bookings";
import { askAboutTrips, dueThisWeek } from "../src/lib/activeTrips";
import { handleConversations } from "../worker/conversations";
import worker from "../worker/index";
import * as store from "../worker/store";
import { fakeD1 } from "./helpers/fakeD1";

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

let env: Env;
beforeEach(() => {
  env = { ANTHROPIC_API_KEY: "k", APP_PASSWORD: "test-magic-words", DB: fakeD1() } as Env;
});

async function api(method: string, path: string, body?: unknown) {
  const req = new Request(`https://app.test/api/conversations${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleConversations(req, env, path.split("/").filter(Boolean), { now: () => 1_000_000 });
}

async function newTrip(destination = "Walt Disney World", lastName = "Rivera") {
  const res = await api("POST", "", { kind: "trip", details: { lastName, destination, dates: "June 19–23, 2027", party: "2 adults" } });
  return ((await res.json()) as { id: string }).id;
}

const book = (id: string, arrival: string, departure: string | null = null) => api("PUT", `/${id}/booking`, { arrival, departure });
const booking = async (res: Response) => {
  expect(res.status).toBe(200);
  return (await res.json()) as Booking;
};
const days = (b: Booking) => b.keyDates.map((d) => [d.due, d.daysBefore]);

describe("reading the trip's dates as she typed them", () => {
  it.each([
    ["June 19–23, 2027", "2027-06-19", "2027-06-23"],
    ["June 28 – July 3, 2027", "2027-06-28", "2027-07-03"],
    ["Dec 28 – Jan 3, 2027", "2026-12-28", "2027-01-03"],
    ["Dec 28, 2026 - Jan 3, 2027", "2026-12-28", "2027-01-03"],
    ["Sept 3rd through 7th, 2027", "2027-09-03", "2027-09-07"],
    ["Walt Disney World, June 8 to 14 2027", "2027-06-08", "2027-06-14"],
    ["3/14/2027 - 3/20/2027", "2027-03-14", "2027-03-20"],
    ["2027-03-14 to 2027-03-20", "2027-03-14", "2027-03-20"],
  ])("reads %s", (text, arrival, departure) => {
    expect(guessTripDays(text)).toEqual({ arrival, departure });
  });

  it("reads a single day, and leaves anything it can't read for her to pick", () => {
    expect(guessTripDays("March 14th, 2027")).toEqual({ arrival: "2027-03-14" });
    expect(guessTripDays("sometime next summer")).toEqual({});
    expect(guessTripDays("June 2027")).toEqual({});
    expect(guessTripDays("Feb 30, 2027")).toEqual({});
    // Coming home before arriving can't be right, so only the arrival is used.
    expect(guessTripDays("June 23-19, 2027")).toEqual({ arrival: "2027-06-23" });
  });
});

describe("day helpers", () => {
  it("checks, counts and words days without time zones moving them", () => {
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2027-02-29")).toBe(false);
    expect(isDay("2027-6-1")).toBe(false);
    expect(isDay(20270601)).toBe(false);
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
    expect(daysBetween("2027-03-10", "2027-03-14")).toBe(4);
    expect(daysBetween("2027-03-14", "2027-03-10")).toBe(-4);
    expect(fromToday("2027-03-14", "2027-03-14")).toBe("today");
    expect(fromToday("2027-03-15", "2027-03-14")).toBe("tomorrow");
    expect(fromToday("2027-03-13", "2027-03-14")).toBe("yesterday");
    expect(fromToday("2027-03-26", "2027-03-14")).toBe("in 12 days");
    expect(fromToday("2027-03-11", "2027-03-14")).toBe("3 days ago");
    expect(formatDay("2027-03-14", "2027-01-01")).toBe("Sun, Mar 14");
    expect(formatDay("2027-03-14", "2026-12-01")).toBe("Sun, Mar 14, 2027");
    expect(formatDay("2027-03-14")).toBe("Sun, Mar 14, 2027");
  });
});

describe("the reminders a booked trip starts with", () => {
  it("counts back 60, 30 and 7 days, worded for where they're going", () => {
    const disney = defaultReminders("Walt Disney World");
    expect(disney.map((r) => r.daysBefore)).toEqual([60, 30, 7]);
    expect(disney[0].label).toMatch(/^Dining reservations/);
    expect(disney[2].label).toMatch(/Lightning Lane/);
    expect(defaultReminders("Disneyland")[2].label).toMatch(/Lightning Lane/);
    expect(defaultReminders("Universal Orlando")[2].label).toMatch(/Express passes/);
    const cruise = defaultReminders("Disney Cruise Line");
    expect(cruise[0].label).toMatch(/excursions/);
    expect(cruise[2].label).toMatch(/Travel documents/);
    expect(defaultReminders("")[1].label).toMatch(/Final payment/);
  });
});

describe("marking a trip booked", () => {
  it("adds the three reminders counted back from arrival, and shows the booking with the trip", async () => {
    const id = await newTrip();
    const b = await booking(await book(id, "2027-06-19", "2027-06-23"));
    expect(b).toMatchObject({ arrival: "2027-06-19", departure: "2027-06-23" });
    expect(days(b)).toEqual([
      ["2027-04-20", 60],
      ["2027-05-20", 30],
      ["2027-06-12", 7],
    ]);
    expect(b.keyDates.every((d) => !d.done)).toBe(true);
    expect(b.keyDates[2].label).toMatch(/Lightning Lane/);

    const trip = (await (await api("GET", `/${id}`)).json()) as { booking: Booking };
    expect(trip.booking).toEqual(b);
  });

  it("moves the reminders when arrival changes, but leaves the dates she set herself", async () => {
    const id = await newTrip();
    const first = await booking(await book(id, "2027-06-19"));
    await booking(await api("POST", `/${id}/key-dates`, { label: "Travel insurance deadline", due: "2027-05-01" }));
    // Changing a reminder's day makes it hers, so it stops moving.
    await booking(await api("PATCH", `/${id}/key-dates/${first.keyDates[1].id}`, { due: "2027-05-25" }));

    const moved = await booking(await book(id, "2027-07-01", "2027-07-06"));
    expect(moved).toMatchObject({ arrival: "2027-07-01", departure: "2027-07-06" });
    expect(moved.keyDates.map((d) => [d.label.split(" ")[0], d.due, d.daysBefore])).toEqual([
      ["Travel", "2027-05-01", null],
      ["Dining", "2027-05-02", 60],
      ["Final", "2027-05-25", null],
      ["Lightning", "2027-06-24", 7],
    ]);
  });

  it("makes a reminder that has already passed due today, for a trip booked late or moved sooner", async () => {
    const id = await newTrip();
    const late = await booking(await api("PUT", `/${id}/booking`, { arrival: "2027-06-19", departure: null, today: "2027-06-01" }));
    expect(days(late)).toEqual([
      ["2027-06-01", 60],
      ["2027-06-01", 30],
      ["2027-06-12", 7],
    ]);
    const later = await booking(await api("PUT", `/${id}/booking`, { arrival: "2027-09-01", departure: null, today: "2027-06-01" }));
    expect(days(later)).toEqual([
      ["2027-07-03", 60],
      ["2027-08-02", 30],
      ["2027-08-25", 7],
    ]);
    const sooner = await booking(await api("PUT", `/${id}/booking`, { arrival: "2027-06-20", departure: null, today: "2027-06-02" }));
    expect(days(sooner)).toEqual([
      ["2027-06-02", 60],
      ["2027-06-02", 30],
      ["2027-06-13", 7],
    ]);
  });

  it("adds no reminders for a trip that's already under way", async () => {
    const id = await newTrip();
    const b = await booking(await api("PUT", `/${id}/booking`, { arrival: "2027-06-19", departure: "2027-06-23", today: "2027-06-21" }));
    expect(b).toEqual({ arrival: "2027-06-19", departure: "2027-06-23", keyDates: [] });
  });

  it("checks the days", async () => {
    const id = await newTrip();
    for (const arrival of ["", "2027-02-30", "June 19", 20270619]) {
      const res = await api("PUT", `/${id}/booking`, { arrival });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Pick the day they arrive." });
    }
    expect(await (await book(id, "2027-06-19", "2027-06-18")).json()).toEqual({
      error: "They come home before they arrive — check the dates.",
    });
    expect((await book(id, "2027-06-19", "soon")).status).toBe(400);
    expect((await api("PATCH", `/${id}/booking`, { arrival: "2027-06-19" })).status).toBe(405);
    expect(await store.getBooking(env.DB, id)).toBeNull();
  });

  it("only books trips", async () => {
    const chat = ((await (await api("POST", "", { kind: "chat", title: "Ideas" })).json()) as { id: string }).id;
    const res = await book(chat, "2027-06-19");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Only trips can be booked." });
    expect((await book("no-such-trip", "2027-06-19")).status).toBe(404);
  });

  it("takes the trip off Active trips with its key dates, and starts fresh if booked again", async () => {
    const id = await newTrip();
    await book(id, "2027-06-19");
    await api("POST", `/${id}/key-dates`, { label: "Final payment due", due: "2027-05-05" });
    const res = await api("DELETE", `/${id}/booking`);
    expect(await res.json()).toEqual({ ok: true });
    expect(((await (await api("GET", `/${id}`)).json()) as { booking: unknown }).booking).toBeNull();
    expect(await store.listActiveTrips(env.DB)).toEqual([]);
    expect((await booking(await book(id, "2027-06-19"))).keyDates).toHaveLength(3);
  });

  it("goes when the trip is deleted", async () => {
    const id = await newTrip();
    await book(id, "2027-06-19");
    await api("DELETE", `/${id}`);
    expect(await store.listActiveTrips(env.DB)).toEqual([]);
    const { results } = await env.DB.prepare("SELECT id FROM key_dates").all();
    expect(results).toEqual([]);
  });
});

describe("a booked trip's key dates", () => {
  it("need the trip booked first", async () => {
    const id = await newTrip();
    const res = await api("POST", `/${id}/key-dates`, { label: "Final payment", due: "2027-05-01" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Mark the trip as booked first." });
  });

  it("adds her own dates, in order, and checks what she typed", async () => {
    const id = await newTrip();
    await book(id, "2027-06-19");
    const b = await booking(await api("POST", `/${id}/key-dates`, { label: "  Final payment due  ", due: "2027-05-05" }));
    expect(b.keyDates.map((d) => d.label)[1]).toBe("Final payment due");
    expect(b.keyDates[1]).toMatchObject({ due: "2027-05-05", daysBefore: null, done: false });

    const refused = async (body: unknown) => {
      const res = await api("POST", `/${id}/key-dates`, body);
      expect(res.status).toBe(400);
      return ((await res.json()) as { error: string }).error;
    };
    expect(await refused({ label: "   ", due: "2027-05-05" })).toBe("Say what the date is for.");
    expect(await refused({ label: "x".repeat(201), due: "2027-05-05" })).toMatch(/under 200 characters/);
    expect(await refused({ label: "Pay with 4111 1111 1111 1111", due: "2027-05-05" })).toMatch(/card number/);
    expect(await refused({ label: "Final payment", due: "May 5" })).toBe("Pick the day it's due.");
    expect((await store.getBooking(env.DB, id))?.keyDates).toHaveLength(4);
  });

  it(`stops at ${MAX_KEY_DATES} dates a trip`, async () => {
    const id = await newTrip();
    await book(id, "2027-06-19");
    for (let i = 3; i < MAX_KEY_DATES; i++) await store.addKeyDate(env.DB, id, `Date ${i}`, "2027-05-01", i);
    const res = await api("POST", `/${id}/key-dates`, { label: "One more", due: "2027-05-01" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: `A trip can have up to ${MAX_KEY_DATES} key dates.` });
  });

  it("ticks off, renames and removes a date", async () => {
    const id = await newTrip();
    const [first] = (await booking(await book(id, "2027-06-19"))).keyDates;
    const ticked = await booking(await api("PATCH", `/${id}/key-dates/${first.id}`, { done: true }));
    expect(ticked.keyDates[0]).toMatchObject({ id: first.id, done: true, daysBefore: 60 });
    const renamed = await booking(await api("PATCH", `/${id}/key-dates/${first.id}`, { label: "Dining opens at 6am ET", done: false }));
    expect(renamed.keyDates[0]).toMatchObject({ label: "Dining opens at 6am ET", done: false, due: first.due, daysBefore: 60 });
    expect((await api("PATCH", `/${id}/key-dates/${first.id}`, { done: "yes" })).status).toBe(400);
    expect((await api("PATCH", `/${id}/key-dates/${first.id}`, { label: "" })).status).toBe(400);

    const removed = await booking(await api("DELETE", `/${id}/key-dates/${first.id}`));
    expect(removed.keyDates.map((d) => d.id)).not.toContain(first.id);
    expect(removed.keyDates).toHaveLength(2);
  });

  it("only changes the trip's own dates", async () => {
    const mine = await newTrip();
    const other = await newTrip("Disneyland", "Chen");
    const [theirs] = (await booking(await book(other, "2027-08-01"))).keyDates;
    await book(mine, "2027-06-19");
    for (const [method, body] of [
      ["PATCH", { done: true }],
      ["PATCH", {}],
      ["DELETE", undefined],
    ] as const) {
      const res = await api(method, `/${mine}/key-dates/${theirs.id}`, body);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "That date wasn't found." });
    }
    expect((await store.getBooking(env.DB, other))?.keyDates[0]).toEqual(theirs);
  });
});

describe("the Active trips list", () => {
  async function loginCookie() {
    const res = await worker.fetch(
      new Request("https://app.test/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "test magic words" }),
      }),
      env,
      CTX,
    );
    return res.headers.get("set-cookie")!.split(";")[0];
  }

  it("needs signing in, then lists booked trips soonest first with their key dates", async () => {
    expect((await worker.fetch(new Request("https://app.test/api/bookings"), env, CTX)).status).toBe(401);
    const later = await newTrip("Disneyland", "Chen");
    const sooner = await newTrip("Universal Orlando", "Rivera");
    await newTrip("Disney Cruise Line", "Okafor"); // not booked
    await book(later, "2027-08-01");
    await book(sooner, "2027-06-19", "2027-06-23");

    const res = await worker.fetch(new Request("https://app.test/api/bookings", { headers: { cookie: await loginCookie() } }), env, CTX);
    expect(res.status).toBe(200);
    const trips = (await res.json()) as ActiveTrip[];
    expect(trips.map((t) => [t.title, t.destination, t.booking.arrival, t.booking.keyDates.length])).toEqual([
      ["Rivera family", "Universal Orlando", "2027-06-19", 3],
      ["Chen family", "Disneyland", "2027-08-01", 3],
    ]);
    expect(trips[0].booking.keyDates[2].label).toMatch(/Express passes/);
  });
});

const keyDate = (id: string, due: string, done = false, label = `Thing ${id}`): KeyDate => ({ id, label, due, daysBefore: null, done });
const activeTrip = (id: string, arrival: string, departure: string | null, keyDates: KeyDate[]): ActiveTrip => ({
  id,
  title: `${id} family`,
  destination: "Walt Disney World",
  resort: "",
  booking: { arrival, departure, keyDates },
});

describe("what's due this week", () => {
  const TODAY = "2027-06-01";
  const trips = [
    activeTrip("Lopez", "2027-05-28", "2027-06-03", [keyDate("l-old", "2027-05-20"), keyDate("l-soon", "2027-06-02")]),
    activeTrip("Rivera", "2027-06-05", "2027-06-09", [
      keyDate("r-late", "2027-05-30"),
      keyDate("r-done", "2027-06-03", true),
      keyDate("r-edge", "2027-06-08"),
      keyDate("r-next-week", "2027-06-09"),
    ]),
    activeTrip("Chen", "2027-06-08", null, []),
    activeTrip("Okafor", "2027-06-20", null, [keyDate("o-today", TODAY)]),
    activeTrip("Home", "2027-05-01", "2027-05-05", [keyDate("h-old", "2027-04-30")]),
  ];

  it("lists the next 7 days soonest first, with overdue dates for trips that haven't started and arrivals", () => {
    const due = dueThisWeek(trips, TODAY);
    expect(due.map((d) => (d.kind === "arrival" ? `${d.trip.id} arrive` : d.date.id))).toEqual([
      "r-late",
      "o-today",
      "l-soon",
      "Rivera arrive",
      "r-edge",
      "Chen arrive",
    ]);
    expect(due.find((d) => d.kind === "key-date" && d.date.id === "r-late")?.overdue).toBe(true);
    expect(due.find((d) => d.kind === "key-date" && d.date.id === "o-today")?.overdue).toBe(false);
    expect(dueThisWeek([], TODAY)).toEqual([]);
  });

  it("asks the assistant with her question first, then each trip that isn't over and its dates", () => {
    const text = askAboutTrips("  What deadlines are this week?  ", trips, TODAY);
    expect(text.startsWith("What deadlines are this week?\n")).toBe(true);
    expect(text).toContain("today is Tue, Jun 1, 2027");
    expect(text).toContain("- Rivera family: Walt Disney World. Arrives Sat, Jun 5, 2027 (in 4 days), home Wed, Jun 9, 2027.");
    expect(text).toContain("  - Thu, Jun 3, 2027: Thing r-done [done]");
    expect(text).toContain("  - Tue, Jun 8, 2027: Thing r-edge [to do]");
    expect(text).toContain("Lopez family");
    expect(text).not.toContain("Home family");
    expect(text).toContain("typical timing, not the booking's rules");
    expect(askAboutTrips("Anything due?", [], TODAY)).toContain("- No booked trips yet.");
  });
});
