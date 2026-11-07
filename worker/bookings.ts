// Active trips: /api/conversations/:id/booking (PUT books or changes the days, DELETE unbooks),
// /api/conversations/:id/key-dates[/:dateId] (POST adds, PATCH changes, DELETE removes), and
// /api/bookings (GET: every booked trip with its key dates). Changes answer with the trip's booking.
import { defaultReminders, isDay, MAX_KEY_DATE_LABEL, MAX_KEY_DATES, reminderDue } from "../shared/bookings";
import { findSensitive, SENSITIVE_MESSAGES } from "../shared/guard";
import * as store from "./store";

const BAD_REQUEST = "That request didn't make sense — try again.";
const error = (message: string, status: number) => Response.json({ error: message }, { status });
const readJson = (request: Request) =>
  request
    .json()
    .then((b) => (b && typeof b === "object" ? (b as Record<string, unknown>) : null))
    .catch(() => null);

export async function handleActiveTrips(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return error("Not allowed.", 405);
  return Response.json(await store.listActiveTrips(env.DB));
}

/** A key date's label: her words, so no card, SSN or passport numbers. */
function checkLabel(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "Say what the date is for." };
  const value = raw.trim();
  if (value.length > MAX_KEY_DATE_LABEL)
    return {
      ok: false,
      error: `Keep it under ${MAX_KEY_DATE_LABEL} characters.`,
    };
  const sensitive = findSensitive(value);
  return sensitive.length ? { ok: false, error: SENSITIVE_MESSAGES[sensitive[0]] } : { ok: true, value };
}

export async function handleBooking(
  request: Request,
  env: Env,
  convo: store.Conversation,
  action: "booking" | "key-dates",
  dateId: string | undefined,
  now: number,
): Promise<Response> {
  if (convo.kind !== "trip") return error("Only trips can be booked.", 400);
  const method = request.method;
  const answer = async () => Response.json(await store.getBooking(env.DB, convo.id));

  if (action === "booking") {
    if (dateId) return error("not found", 404);
    if (method === "DELETE") {
      await store.deleteBooking(env.DB, convo.id);
      return Response.json({ ok: true });
    }
    if (method !== "PUT") return error("Not allowed.", 405);
    const body = await readJson(request);
    const arrival = body?.arrival;
    const departure = body?.departure ?? null;
    if (!isDay(arrival)) return error("Pick the day they arrive.", 400);
    if (departure !== null && !isDay(departure)) return error(BAD_REQUEST, 400);
    if (departure !== null && departure < arrival) return error("They come home before they arrive — check the dates.", 400);
    // Her own day (sent by the page), so a reminder that has already passed is due today, not "overdue" the day she books.
    const sent = body?.today;
    const today = isDay(sent) ? sent : new Date(now).toISOString().slice(0, 10);
    // A trip that's already under way needs no reminders before it.
    const reminders =
      arrival < today
        ? []
        : defaultReminders(convo.details.destination ?? "").map((r) => ({ ...r, due: reminderDue(arrival, r.daysBefore, today) }));
    await store.saveBooking(env.DB, convo.id, { arrival, departure }, reminders, today, now);
    return answer();
  }

  const booking = await store.getBooking(env.DB, convo.id);
  if (!booking) return error("Mark the trip as booked first.", 400);

  if (!dateId) {
    if (method !== "POST") return error("Not allowed.", 405);
    if (booking.keyDates.length >= MAX_KEY_DATES) return error(`A trip can have up to ${MAX_KEY_DATES} key dates.`, 400);
    const body = await readJson(request);
    const label = checkLabel(body?.label);
    if (!label.ok) return error(label.error, 400);
    if (!isDay(body?.due)) return error("Pick the day it's due.", 400);
    await store.addKeyDate(env.DB, convo.id, label.value, body.due, now);
    return answer();
  }

  if (method === "DELETE") {
    return (await store.deleteKeyDate(env.DB, convo.id, dateId)) ? answer() : error("That date wasn't found.", 404);
  }
  if (method !== "PATCH") return error("Not allowed.", 405);
  const body = await readJson(request);
  if (!body) return error(BAD_REQUEST, 400);
  const changes: { label?: string; due?: string; done?: boolean } = {};
  if (body.label !== undefined) {
    const label = checkLabel(body.label);
    if (!label.ok) return error(label.error, 400);
    changes.label = label.value;
  }
  if (body.due !== undefined) {
    if (!isDay(body.due)) return error("Pick the day it's due.", 400);
    changes.due = body.due;
  }
  if (body.done !== undefined) {
    if (typeof body.done !== "boolean") return error(BAD_REQUEST, 400);
    changes.done = body.done;
  }
  return (await store.updateKeyDate(env.DB, convo.id, dateId, changes)) ? answer() : error("That date wasn't found.", 404);
}
