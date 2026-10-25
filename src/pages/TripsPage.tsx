import { useEffect, useState } from "react";
import { IconArrowLeft, IconPin, IconPinnedOff, IconPlus, IconTrash } from "@tabler/icons-react";
import type { Conversation } from "../../shared/conversations";
import { CastleAtDusk } from "../art/CastleAtDusk";
import { deleteConversation, listConversations, updateConversation } from "../lib/api";
import { clearHandoff } from "../lib/handoff";

const ago = (ms: number) => {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `${days} days ago` : new Date(ms).toLocaleDateString();
};

function TripCard({ trip, onChanged }: { trip: Conversation; onChanged(): void }) {
  const [confirming, setConfirming] = useState(false);
  const where = [trip.details.destination, trip.details.dates].filter(Boolean).join(" · ");
  return (
    <li className="trip-card">
      <a className="trip-link" href={`#/trips/${trip.id}`}>
        <strong>{trip.title}</strong>
        {where && <span>{where}</span>}
        <span className="muted-note">updated {ago(trip.updated_at)}</span>
      </a>
      <div className="trip-actions">
        <button
          type="button"
          className="btn-icon"
          aria-label={trip.pinned ? "Unpin" : "Pin"}
          title={trip.pinned ? "Unpin" : "Pin to the top"}
          onClick={() => void updateConversation(trip.id, { pinned: !trip.pinned }).then(onChanged)}
        >
          {trip.pinned ? <IconPinnedOff size={18} aria-hidden /> : <IconPin size={18} aria-hidden />}
        </button>
        {confirming ? (
          <span className="confirm">
            Delete this trip?
            <button type="button" className="btn-quiet danger" onClick={() => void deleteConversation(trip.id).then(onChanged)}>
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

export function TripsPage() {
  const [trips, setTrips] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = () =>
    listConversations("trip")
      .then(setTrips)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  const shown = (trips ?? []).filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()));
  const pinned = shown.filter((t) => t.pinned);
  const recent = shown.filter((t) => !t.pinned);

  return (
    <>
      <header className="hero">
        <CastleAtDusk />
        <div className="banner-text">
          <a className="back" href="#/">
            <IconArrowLeft size={16} aria-hidden />
            All tools
          </a>
          <h1>Adventure Planner</h1>
        </div>
      </header>
      <main className="page trips">
        <div className="trips-bar">
          <label htmlFor="trip-search" className="sr-only">
            Find a trip by last name
          </label>
          <input id="trip-search" type="search" placeholder="Find a trip by last name…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            <ul className="trip-list">{pinned.map((t) => <TripCard key={t.id} trip={t} onChanged={load} />)}</ul>
          </section>
        )}
        {recent.length > 0 && (
          <section>
            <h2 className="list-heading">Recent trips</h2>
            <ul className="trip-list">{recent.map((t) => <TripCard key={t.id} trip={t} onChanged={load} />)}</ul>
          </section>
        )}
      </main>
    </>
  );
}
