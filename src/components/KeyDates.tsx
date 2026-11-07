import { useState } from "react";
import { IconCalendarCheck, IconCheck, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import {
  daysBetween,
  formatDay,
  fromToday,
  guessTripDays,
  localDay,
  MAX_KEY_DATE_LABEL,
  type Booking,
  type KeyDate,
} from "../../shared/bookings";
import { addKeyDate, deleteKeyDate, saveBooking, unbook, updateKeyDate } from "../lib/api";

/** Marks the trip booked (or changes its days): arrival, and the day they come home if she knows it. */
export function BookingForm({
  tripId,
  datesText,
  booking,
  onSaved,
  onCancel,
}: {
  tripId: string;
  /** The trip's dates as typed ("June 19–23, 2027"), to start the form with. */
  datesText: string;
  booking: Booking | null;
  onSaved(b: Booking): void;
  onCancel(): void;
}) {
  const guess = booking ? { arrival: booking.arrival, departure: booking.departure ?? undefined } : guessTripDays(datesText);
  const [arrival, setArrival] = useState(guess.arrival ?? "");
  const [departure, setDeparture] = useState(guess.departure ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await saveBooking(tripId, { arrival, departure: departure || null, today: localDay() }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="card booking-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2>{booking ? "Change the travel dates" : "Mark as booked"}</h2>
      <p className="muted-note">
        {booking
          ? "Reminders counted back from arrival move with it. Dates you added or changed yourself stay put."
          : "The trip moves to Active trips, with reminders 60, 30 and 7 days before they arrive (any already past are due today). You can change or remove any of them."}
      </p>
      <div className="booking-days">
        <label className="field">
          <span className="field-label">They arrive</span>
          <input type="date" required value={arrival} onChange={(e) => setArrival(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">They come home (optional)</span>
          <input type="date" min={arrival || undefined} value={departure} onChange={(e) => setDeparture(e.target.value)} />
        </label>
      </div>
      {error && <p className="message message-error">{error}</p>}
      <div className="actions">
        <button type="submit" className="btn-primary" disabled={busy || !arrival}>
          <IconCalendarCheck size={16} aria-hidden /> {booking ? "Save dates" : "Mark as booked"}
        </button>
        <button type="button" className="btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function KeyDateRow({
  tripId,
  date,
  today,
  onChanged,
  onError,
}: {
  tripId: string;
  date: KeyDate;
  today: string;
  onChanged(b: Booking): void;
  onError(m: string): void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(date.label);
  const [due, setDue] = useState(date.due);
  const fail = (e: Error) => onError(e.message);
  const overdue = !date.done && date.due < today;

  if (editing) {
    return (
      <li className="key-date editing">
        <input
          type="text"
          aria-label="What it's for"
          maxLength={MAX_KEY_DATE_LABEL}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input type="date" aria-label="Due" value={due} onChange={(e) => setDue(e.target.value)} />
        <button
          type="button"
          className="btn-icon"
          aria-label="Save"
          disabled={!label.trim() || !due}
          onClick={() =>
            void updateKeyDate(tripId, date.id, {
              label,
              ...(due !== date.due ? { due } : {}),
            })
              .then((b) => {
                setEditing(false);
                onChanged(b);
              })
              .catch(fail)
          }
        >
          <IconCheck size={16} aria-hidden />
        </button>
        <button type="button" className="btn-icon" aria-label="Cancel" onClick={() => setEditing(false)}>
          <IconX size={16} aria-hidden />
        </button>
      </li>
    );
  }
  const box = `key-date-${date.id}`;
  return (
    <li className={`key-date${date.done ? " done" : ""}${overdue ? " overdue" : ""}`}>
      <input
        id={box}
        type="checkbox"
        checked={date.done}
        onChange={(e) => void updateKeyDate(tripId, date.id, { done: e.target.checked }).then(onChanged).catch(fail)}
      />
      <label className="key-date-label" htmlFor={box}>
        {date.label}
      </label>
      <span className="key-date-when">
        <span className="key-date-day">{formatDay(date.due, today)}</span> ·{" "}
        <span className="muted-note">
          {date.done ? "done" : overdue ? `overdue, ${fromToday(date.due, today)}` : fromToday(date.due, today)}
        </span>
      </span>
      <span className="key-date-actions">
        <button type="button" className="btn-icon" aria-label="Change this date" onClick={() => setEditing(true)}>
          <IconPencil size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-icon"
          aria-label="Remove this date"
          onClick={() => void deleteKeyDate(tripId, date.id).then(onChanged).catch(fail)}
        >
          <IconTrash size={15} aria-hidden />
        </button>
      </span>
    </li>
  );
}

/** A booked trip's key dates on its page: tick them off, change them, or add her own (final payment, insurance…). */
export function KeyDatesCard({
  tripId,
  booking,
  onChanged,
  onUnbooked,
}: {
  tripId: string;
  booking: Booking;
  onChanged(b: Booking): void;
  onUnbooked(): void;
}) {
  const today = localDay();
  const [label, setLabel] = useState("");
  const [due, setDue] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toGo = daysBetween(today, booking.arrival);
  const changed = (b: Booking) => {
    setError(null);
    onChanged(b);
  };

  return (
    <section className="card key-dates" aria-label="Key dates">
      <h2>Key dates</h2>
      <p className="trip-when">
        Arrives {formatDay(booking.arrival, today)}
        {toGo >= 0 ? ` (${fromToday(booking.arrival, today)})` : ""}
        {booking.departure ? ` · home ${formatDay(booking.departure, today)}` : ""}
      </p>
      {booking.keyDates.length > 0 ? (
        <ul className="key-date-list">
          {booking.keyDates.map((d) => (
            <KeyDateRow key={`${d.id}-${d.due}-${d.label}`} tripId={tripId} date={d} today={today} onChanged={changed} onError={setError} />
          ))}
        </ul>
      ) : (
        <p className="muted-note">No key dates yet.</p>
      )}
      <form
        className="key-date-add"
        onSubmit={(e) => {
          e.preventDefault();
          void addKeyDate(tripId, { label, due })
            .then((b) => {
              setLabel("");
              setDue("");
              changed(b);
            })
            .catch((err: Error) => setError(err.message));
        }}
      >
        <input
          type="text"
          aria-label="What it's for"
          placeholder="Final payment due, insurance deadline…"
          maxLength={MAX_KEY_DATE_LABEL}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input type="date" aria-label="Due" value={due} onChange={(e) => setDue(e.target.value)} />
        <button type="submit" className="btn-quiet" disabled={!label.trim() || !due}>
          <IconPlus size={14} aria-hidden /> Add
        </button>
      </form>
      {error && <p className="message message-error">{error}</p>}
      <p className="muted-note">
        The 60, 30 and 7-day reminders are typical timing, not the booking's rules. Check each against the booking.
      </p>
      {confirming ? (
        <span className="confirm">
          Take it off Active trips? Its key dates go too.
          <button
            type="button"
            className="btn-quiet danger"
            onClick={() =>
              void unbook(tripId)
                .then(onUnbooked)
                .catch((e: Error) => setError(e.message))
            }
          >
            Not booked
          </button>
          <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </span>
      ) : (
        <button type="button" className="btn-quiet" onClick={() => setConfirming(true)}>
          Not booked after all
        </button>
      )}
    </section>
  );
}
