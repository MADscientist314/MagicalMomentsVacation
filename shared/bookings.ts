// Booked trips ("Active trips"): when the family arrives and comes home, and the key dates to act on before
// they go, so Jillian can see what's due this week across every booked trip.

/** A calendar day, "2027-03-14". Dates are days, not moments, so they never shift with time zones. */
export function isDay(x: unknown): x is string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(`${x}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Today on her own calendar (the browser's day). */
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "Sun, Mar 14", or with the year when it isn't this one. */
export function formatDay(day: string, today?: string): string {
  const withYear = !today || day.slice(0, 4) !== today.slice(0, 4);
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** "today", "tomorrow", "in 12 days", "3 days ago". */
export function fromToday(day: string, today: string): string {
  const n = daysBetween(today, day);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** A reminder's day: `daysBefore` arrival, or today when that has already passed (a trip booked late). */
export function reminderDue(arrival: string, daysBefore: number, today: string): string {
  const due = addDays(arrival, -daysBefore);
  return due < today ? today : due;
}

export interface KeyDate {
  id: string;
  label: string;
  due: string;
  /** Set for a reminder counted back from arrival, which moves when the arrival date does; null for her own dates. */
  daysBefore: number | null;
  done: boolean;
}

export interface Booking {
  arrival: string;
  departure: string | null;
  keyDates: KeyDate[];
}

export interface ActiveTrip {
  id: string;
  title: string;
  destination: string;
  resort: string;
  booking: Booking;
}

export const MAX_KEY_DATE_LABEL = 200;
export const MAX_KEY_DATES = 40;

const PARKS = ["Walt Disney World", "Disneyland"];

/**
 * Reminders added when she marks a trip booked, counted back from arrival: the 60, 30 and 7 days she named
 * in the Nov 7 review. They're checkpoints, not policy, so each says what to check; she edits them per trip.
 */
export function defaultReminders(destination: string): { daysBefore: number; label: string }[] {
  const universal = destination === "Universal Orlando";
  const parks = universal || PARKS.includes(destination);
  return [
    {
      daysBefore: 60,
      label: parks ? "Dining reservations (check when they open for this trip)" : "Dining, excursions and extras (check when they open)",
    },
    {
      daysBefore: 30,
      label: "Final payment and online check-in (check the due dates)",
    },
    {
      daysBefore: 7,
      label: universal
        ? "Express passes, and set up the Universal app"
        : parks
          ? "Lightning Lane, and set up the Disney app"
          : "Travel documents, and set up the app",
    },
  ];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const month = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;
const day = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Reads the trip's dates as she typed them ("June 19–23, 2027", "Dec 28 – Jan 3, 2027", "3/14/2027 - 3/20/2027"),
 * to start the booked form with them. Anything it can't read is left for her to pick.
 */
export function guessTripDays(text: string): {
  arrival?: string;
  departure?: string;
} {
  const t = text.replace(/[–—]/g, "-").replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  const M =
    "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
  const checked = (out: { arrival?: string; departure?: string }) => ({
    ...(out.arrival && isDay(out.arrival) ? { arrival: out.arrival } : {}),
    ...(out.departure && isDay(out.departure) && out.arrival && out.departure >= out.arrival ? { departure: out.departure } : {}),
  });

  // "June 19-23, 2027", "June 28 - July 3, 2027", "Dec 28, 2026 - Jan 3, 2027", "Dec 28 - Jan 3, 2027"
  let m = new RegExp(`${M}\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?\\s*(?:-|to|through|thru)\\s*(?:${M}\\s+)?(\\d{1,2}),?\\s*(\\d{4})`, "i").exec(
    t,
  );
  if (m) {
    const [, m1, d1, y1, m2, d2, y2] = m;
    const endMonth = m2 ? month(m2) : month(m1);
    const endYear = Number(y2);
    const startYear = y1 ? Number(y1) : endMonth < month(m1) ? endYear - 1 : endYear;
    return checked({
      arrival: day(startYear, month(m1), Number(d1)),
      departure: day(endYear, endMonth, Number(d2)),
    });
  }
  // "March 14, 2027" (one day)
  m = new RegExp(`${M}\\s+(\\d{1,2}),?\\s*(\\d{4})`, "i").exec(t);
  if (m) return checked({ arrival: day(Number(m[3]), month(m[1]), Number(m[2])) });
  // "3/14/2027 - 3/20/2027" or "3/14/2027"
  const numeric = [...t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)].map((x) => day(Number(x[3]), Number(x[1]), Number(x[2])));
  if (numeric.length) return checked({ arrival: numeric[0], departure: numeric[1] });
  // "2027-03-14"
  const iso = [...t.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((x) => x[1]);
  if (iso.length) return checked({ arrival: iso[0], departure: iso[1] });
  return {};
}
