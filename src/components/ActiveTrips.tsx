import { useEffect, useState } from "react";
import { IconPlaneDeparture, IconSparkles } from "@tabler/icons-react";
import { formatDay, fromToday, localDay, type ActiveTrip } from "../../shared/bookings";
import { MAX_MESSAGE } from "../../shared/conversations";
import { listActiveTrips, updateKeyDate } from "../lib/api";
import { askAboutTrips, dueThisWeek, notOver } from "../lib/activeTrips";
import { joinTranscript } from "../lib/speech";
import { startChat } from "../lib/startChat";
import { MicButton } from "./MicButton";

const where = (t: ActiveTrip) => [t.destination, t.resort].filter(Boolean).join(" · ");

/** The Adventure Planner's Active trips tab: booked trips, what's due this week, and a box to ask about them. */
export function ActiveTrips() {
  const [trips, setTrips] = useState<ActiveTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const today = localDay();

  const load = () =>
    listActiveTrips()
      .then(setTrips)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  if (!trips) return error ? <p className="message message-error">{error}</p> : null;

  const due = dueThisWeek(trips, today);
  const current = trips.filter((t) => notOver(t, today));
  const past = trips.filter((t) => !notOver(t, today)).reverse();

  const ask = async () => {
    setAsking(true);
    const started = await startChat(askAboutTrips(question, trips, today).slice(0, MAX_MESSAGE), question);
    setAsking(false);
    if ("error" in started) return setError(started.error);
    window.location.hash = `#/chat/${started.id}`;
  };

  const tick = (tripId: string, id: string) =>
    void updateKeyDate(tripId, id, { done: true })
      .then(load)
      .catch((e: Error) => setError(e.message));

  if (!trips.length) {
    return (
      <section className="card empty">
        Booked trips show up here with their key dates and what's due this week. Open a trip and choose <strong>Mark as booked</strong>.
      </section>
    );
  }

  return (
    <div className="active-trips">
      {error && <p className="message message-error">{error}</p>}
      <section className="card due-week" aria-label="Due this week">
        <h2>Due this week</h2>
        {due.length ? (
          <ul className="due-list">
            {due.map((item) =>
              item.kind === "arrival" ? (
                <li key={`arrive-${item.trip.id}`} className="due-item arrival">
                  <IconPlaneDeparture size={18} aria-hidden />
                  <span className="key-date-day">{formatDay(item.day, today)}</span>
                  <span>
                    They arrive{item.trip.destination ? ` at ${item.trip.destination}` : ""} ·{" "}
                    <a href={`#/trips/${item.trip.id}`}>{item.trip.title}</a>
                  </span>
                </li>
              ) : (
                <li key={item.date.id} className={`due-item${item.overdue ? " overdue" : ""}`}>
                  <input type="checkbox" aria-label={`Done: ${item.date.label}`} onChange={() => tick(item.trip.id, item.date.id)} />
                  <span className="key-date-day">{formatDay(item.day, today)}</span>
                  <span>
                    {item.date.label} · <a href={`#/trips/${item.trip.id}`}>{item.trip.title}</a>
                    <span className="muted-note">
                      {" "}
                      ({item.overdue ? `overdue, ${fromToday(item.day, today)}` : fromToday(item.day, today)})
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="muted-note">Nothing due in the next 7 days.</p>
        )}
      </section>

      <section className="card ask-trips">
        <div className="field-head">
          <label className="field-label" htmlFor="ask-trips">
            Ask about your booked trips
          </label>
          <MicButton onSpeech={(heard) => setQuestion((q) => joinTranscript(q, heard))} disabled={asking} />
        </div>
        <form
          className="ask-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim() && !asking) void ask();
          }}
        >
          <input
            id="ask-trips"
            type="text"
            placeholder="What deadlines are this week? What's left for the Rivera trip?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={!question.trim() || asking}>
            <IconSparkles size={16} aria-hidden /> {asking ? "Asking…" : "Ask"}
          </button>
        </form>
        <p className="muted-note">Opens a chat with your booked trips and their key dates.</p>
      </section>

      <h2 className="list-heading">Coming up</h2>
      {current.length ? (
        <ul className="trip-list">
          {current.map((t) => {
            const next = t.booking.keyDates.filter((d) => !d.done && d.due >= today).slice(0, 2);
            const away = t.booking.arrival <= today;
            return (
              <li key={t.id} className="trip-card">
                <a className="trip-link" href={`#/trips/${t.id}`}>
                  <strong>{t.title}</strong>
                  {where(t) && <span>{where(t)}</span>}
                  <span>
                    {formatDay(t.booking.arrival, today)}
                    {t.booking.departure ? ` – ${formatDay(t.booking.departure, today)}` : ""} ·{" "}
                    {away ? "traveling now" : fromToday(t.booking.arrival, today)}
                  </span>
                  {next.length > 0 && (
                    <span className="muted-note trip-next">
                      Next: {next.map((d) => `${d.label.replace(/\s*\(.*\)$/, "")}, ${formatDay(d.due, today)}`).join(" · ")}
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted-note">No upcoming trips.</p>
      )}

      {past.length > 0 && (
        <details className="past-trips">
          <summary>Back home ({past.length})</summary>
          <ul className="trip-list">
            {past.map((t) => (
              <li key={t.id} className="trip-card">
                <a className="trip-link" href={`#/trips/${t.id}`}>
                  <strong>{t.title}</strong>
                  <span>
                    {formatDay(t.booking.arrival, today)}
                    {t.booking.departure ? ` – ${formatDay(t.booking.departure, today)}` : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
