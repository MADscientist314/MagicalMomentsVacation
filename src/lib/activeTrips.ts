// What's due across the booked trips, and the context for asking the assistant about them.
import { addDays, formatDay, fromToday, type ActiveTrip, type KeyDate } from "../../shared/bookings";

export type DueItem =
  | {
      kind: "key-date";
      trip: ActiveTrip;
      date: KeyDate;
      day: string;
      overdue: boolean;
    }
  | { kind: "arrival"; trip: ActiveTrip; day: string; overdue: false };

/** Whether the family is still to travel or away now (not home yet). */
export const notOver = (trip: ActiveTrip, today: string) => (trip.booking.departure ?? trip.booking.arrival) >= today;

/**
 * Due from today through the next 7 days, plus anything overdue and not done for a trip that hasn't
 * started, and arrivals this week, soonest first.
 */
export function dueThisWeek(trips: ActiveTrip[], today: string): DueItem[] {
  const end = addDays(today, 7);
  const items: DueItem[] = [];
  for (const trip of trips) {
    const upcoming = trip.booking.arrival >= today;
    for (const date of trip.booking.keyDates) {
      if (date.done || date.due > end) continue;
      if (date.due < today && !upcoming) continue;
      items.push({
        kind: "key-date",
        trip,
        date,
        day: date.due,
        overdue: date.due < today,
      });
    }
    if (trip.booking.arrival >= today && trip.booking.arrival <= end)
      items.push({
        kind: "arrival",
        trip,
        day: trip.booking.arrival,
        overdue: false,
      });
  }
  return items.sort((a, b) => a.day.localeCompare(b.day) || (a.kind === "arrival" ? 1 : 0) - (b.kind === "arrival" ? 1 : 0));
}

/** Her question, then every trip that isn't over with its key dates, for a "Make a wish" chat. */
export function askAboutTrips(question: string, trips: ActiveTrip[], today: string): string {
  const lines = trips
    .filter((t) => notOver(t, today))
    .map((t) => {
      const where = [t.destination, t.resort].filter(Boolean).join(", ");
      const home = t.booking.departure ? `, home ${formatDay(t.booking.departure)}` : "";
      const dates = t.booking.keyDates.map((d) => `  - ${formatDay(d.due)}: ${d.label} [${d.done ? "done" : "to do"}]`);
      return [
        `- ${t.title}${where ? `: ${where}` : ""}. Arrives ${formatDay(t.booking.arrival)} (${fromToday(t.booking.arrival, today)})${home}.`,
        ...dates,
      ].join("\n");
    });
  return [
    question.trim(),
    "",
    `(For context: today is ${formatDay(today)}. My booked trips and their key dates are below. The 60, 30 and 7-day reminders are my typical timing, not the booking's rules, so tell me to check anything you aren't sure of.`,
    ...(lines.length ? lines : ["- No booked trips yet."]),
    ")",
  ].join("\n");
}
