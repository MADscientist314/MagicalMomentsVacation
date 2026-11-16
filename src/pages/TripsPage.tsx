import { useEffect, useState } from "react";
import { IconPin, IconPinnedOff, IconPlus, IconTrash } from "@tabler/icons-react";
import { formatDay, fromToday, localDay, type ActiveTrip } from "../../shared/bookings";
import type { Conversation } from "../../shared/conversations";
import { CastleAtDusk } from "../art/CastleAtDusk";
import { ActiveTrips } from "../components/ActiveTrips";
import { HomeButton } from "../components/HomeButton";
import { deleteConversation, listActiveTrips, listConversations, updateConversation } from "../lib/api";
import { ago } from "../lib/ago";
import { clearHandoff } from "../lib/handoff";

/** Where a trip stands: still being planned, booked, or the family is back home. */
type Stage = "planning" | "booked" | "home";

function stageOf(booked: ActiveTrip | undefined, today: string): Stage {
  if (!booked) return "planning";
  return (booked.booking.departure ?? booked.booking.arrival) >= today ? "booked" : "home";
}

function StageTag({ stage, booked, today }: { stage: Stage; booked?: ActiveTrip; today: string }) {
  if (stage === "planning") return <span className="stage-tag planning">Planning</span>;
  if (stage === "home" || !booked) return <span className="stage-tag home">Back home</span>;
  const arrival = booked.booking.arrival;
  return (
    <span className="stage-tag booked">
      Booked · {arrival <= today ? "traveling now" : `arrives ${formatDay(arrival, today)} (${fromToday(arrival, today)})`}
    </span>
  );
}

function TripCard({
  trip,
  booked,
  today,
  onChanged,
  onError,
}: {
  trip: Conversation;
  booked?: ActiveTrip;
  today: string;
  onChanged(): void;
  onError(message: string): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const fail = (e: Error) => onError(e.message);
  const where = [trip.details.destination, trip.details.dates].filter(Boolean).join(" · ");
  const stage = stageOf(booked, today);
  return (
    <li className={`trip-card stage-${stage}`}>
      <a className="trip-link" href={`#/trips/${trip.id}`}>
        <strong>{trip.title}</strong>
        <StageTag stage={stage} booked={booked} today={today} />
        {where && <span>{where}</span>}
        <span className="muted-note">updated {ago(trip.updated_at)}</span>
      </a>
      <div className="trip-actions">
        <button
          type="button"
          className="btn-icon"
          aria-label={trip.pinned ? "Unpin" : "Pin"}
          title={trip.pinned ? "Unpin" : "Pin to the top"}
          onClick={() => void updateConversation(trip.id, { pinned: !trip.pinned }).then(onChanged).catch(fail)}
        >
          {trip.pinned ? <IconPinnedOff size={18} aria-hidden /> : <IconPin size={18} aria-hidden />}
        </button>
        {confirming ? (
          <span className="confirm">
            Delete this trip?
            <button type="button" className="btn-quiet danger" onClick={() => void deleteConversation(trip.id).then(onChanged).catch(fail)}>
              Delete
            </button>
            <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="btn-icon" aria-label="Delete trip" title="Delete trip" onClick={() => setConfirming(true)}>
            <IconTrash size={18} aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

/** "All trips" lists every trip; "Active trips" (#/trips/active) shows the booked ones and what's due. */
export function TripsPage({ tab }: { tab: "all" | "active" }) {
  const [trips, setTrips] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Booked trips by id, so each card shows its stage (Nov 15 review); a failure here just leaves them all "Planning".
  const [booked, setBooked] = useState<Map<string, ActiveTrip>>(new Map());
  const today = localDay();

  const load = () => {
    listActiveTrips()
      .then((list) => setBooked(new Map(list.map((t) => [t.id, t]))))
      .catch(() => setBooked(new Map()));
    return listConversations("trip")
      .then(setTrips)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    void load();
  }, []);

  const shown = (trips ?? []).filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()));
  const pinned = shown.filter((t) => t.pinned);
  const unpinned = shown.filter((t) => !t.pinned);
  const stage = (t: Conversation) => stageOf(booked.get(t.id), today);
  const groups: { key: Stage; heading: string; trips: Conversation[] }[] = [
    { key: "planning", heading: "Still planning", trips: unpinned.filter((t) => stage(t) === "planning") },
    { key: "booked", heading: "Booked", trips: unpinned.filter((t) => stage(t) === "booked") },
    { key: "home", heading: "Back home", trips: unpinned.filter((t) => stage(t) === "home") },
  ];
  const card = (t: Conversation) => <TripCard key={t.id} trip={t} booked={booked.get(t.id)} today={today} onChanged={load} onError={setError} />;

  return (
    <>
      <header className="hero">
        <CastleAtDusk />
        <HomeButton />
        <div className="banner-text">
          <h1>Adventure Planner</h1>
        </div>
      </header>
      <main className="page trips">
        <div className="tabs trips-tabs" role="tablist" aria-label="Trips">
          <a role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} href="#/trips">
            All trips
          </a>
          <a role="tab" aria-selected={tab === "active"} className={tab === "active" ? "active" : ""} href="#/trips/active">
            Active trips
          </a>
        </div>
        {tab === "active" ? (
          <ActiveTrips />
        ) : (
          <>
            <div className="trips-bar">
              <label htmlFor="trip-search" className="sr-only">
                Find a trip by last name
              </label>
              <input
                id="trip-search"
                type="search"
                placeholder="Find a trip by last name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <a className="btn-primary" href="#/trips/new" onClick={clearHandoff}>
                <IconPlus size={18} aria-hidden /> New trip
              </a>
            </div>
            {error && <p className="message message-error">{error}</p>}
            {trips && trips.length === 0 && (
              <section className="card empty">
                Your trips will live here, one per family. Start with <strong>New trip</strong>, or use <strong>Start a trip</strong> after
                reviewing an inquiry in the Welcome Center.
              </section>
            )}
            {pinned.length > 0 && (
              <section>
                <h2 className="list-heading">📌 Pinned</h2>
                <ul className="trip-list">{pinned.map(card)}</ul>
              </section>
            )}
            {groups
              .filter((g) => g.trips.length > 0)
              .map((g) => (
                <section key={g.key}>
                  <h2 className={`list-heading stage-heading ${g.key}`}>
                    {g.heading} <span className="count">({g.trips.length})</span>
                  </h2>
                  <ul className="trip-list">{g.trips.map(card)}</ul>
                </section>
              ))}
          </>
        )}
      </main>
    </>
  );
}
