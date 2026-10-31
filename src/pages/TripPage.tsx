import { useCallback, useEffect, useState } from "react";
import { IconArrowLeft, IconEdit, IconPin, IconPinnedOff, IconSparkles } from "@tabler/icons-react";
import type { ConversationWithHistory } from "../../shared/conversations";
import { CastleAtDusk } from "../art/CastleAtDusk";
import { Composer } from "../components/Composer";
import { ConversationThread } from "../components/ConversationThread";
import { DeliverablesPanel } from "../components/DeliverablesPanel";
import { ImageStudio } from "../components/ImageStudio";
import { TripDetailsForm } from "../components/TripDetailsForm";
import { getConversation, updateConversation } from "../lib/api";
import { fileStem } from "../lib/deliverableFiles";
import { loadThread, planTrip, sendToThread, useThread } from "../lib/threadStore";

const UPDATE_PLAN = "The trip details just changed (see the note above). Please send the full updated day-by-day plan using the new details.";

export function TripPage({ id }: { id: string }) {
  const [trip, setTrip] = useState<ConversationWithHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Changed details are noted in the conversation, but the plan itself only changes when she asks.
  const [detailsChanged, setDetailsChanged] = useState(false);
  const thread = useThread(id);
  const busy = thread.phase !== "idle";

  const refresh = useCallback(() => {
    getConversation(id)
      .then((t) => {
        setTrip(t);
        setError(null);
        loadThread(id, t.messages);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(refresh, [refresh]);

  if (error && !trip) {
    return (
      <main className="page">
        <p className="message message-error">{error}</p>
        <a href="#/trips">Back to all trips</a>
      </main>
    );
  }
  if (!trip) return null;

  const d = trip.details;
  const planned = thread.turns.length > 0;
  const subtitle = [d.destination, d.dates, d.party].filter(Boolean).join(" · ");

  const saveDetails = async (details: Record<string, string>) => {
    setSaving(true);
    try {
      await updateConversation(id, { details });
      setEditing(false);
      setError(null);
      if (planned) setDetailsChanged(true);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="hero">
        <CastleAtDusk />
        <div className="banner-text">
          <a className="back" href="#/trips">
            <IconArrowLeft size={16} aria-hidden />
            All trips
          </a>
          <h1>{trip.title}</h1>
          {subtitle && <p className="trip-subtitle">{subtitle}</p>}
        </div>
      </header>
      <main className="page trip-page">
        <div className="trip-toolbar">
          <button
            type="button"
            className="btn-quiet"
            onClick={() =>
              void updateConversation(id, { pinned: !trip.pinned })
                .then(refresh)
                .catch((e: Error) => setError(e.message))
            }
          >
            {trip.pinned ? <IconPinnedOff size={16} aria-hidden /> : <IconPin size={16} aria-hidden />}
            {trip.pinned ? "Unpin" : "Pin to the top"}
          </button>
          <button type="button" className="btn-quiet" onClick={() => setEditing((e) => !e)}>
            <IconEdit size={16} aria-hidden /> Edit trip details
          </button>
        </div>

        {error && !editing && <p className="message message-error">{error}</p>}
        {detailsChanged && planned && (
          <div className="message message-info">
            The trip details changed. The current plan still uses the old ones.{" "}
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => {
                const problem = sendToThread(id, UPDATE_PLAN, refresh);
                if (problem) setError(problem);
                else setDetailsChanged(false);
              }}
            >
              <IconSparkles size={16} aria-hidden /> Update the plan
            </button>{" "}
            <button type="button" className="btn-quiet" onClick={() => setDetailsChanged(false)}>
              Not now
            </button>
          </div>
        )}
        {editing && (
          <TripDetailsForm
            initial={d}
            submitLabel="Save details"
            busy={saving}
            error={error}
            onSubmit={(details) => void saveDetails(details)}
            onCancel={() => setEditing(false)}
          />
        )}

        <div className="trip-layout">
          <section className="card trip-main">
            {!planned && !busy ? (
              <div className="empty">
                <p>Ready when you are. I'll draft a day-by-day plan from the trip details.</p>
                <button type="button" className="btn-primary" onClick={() => planTrip(id, refresh)}>
                  <IconSparkles size={18} aria-hidden /> Plan it
                </button>
                {thread.error && <p className="message message-error">{thread.error}</p>}
              </div>
            ) : (
              <>
                <ConversationThread state={thread} mode="trip" />
                <Composer
                  busy={busy}
                  placeholder="Ask for changes or questions… type or tap the mic"
                  restore={thread.restore}
                  error={thread.error}
                  notice={thread.notice}
                  onSend={(text) => sendToThread(id, text, refresh)}
                />
              </>
            )}
          </section>
          <div className="trip-side">
            <DeliverablesPanel
              tripId={id}
              tripTitle={trip.title}
              deliverables={trip.deliverables}
              planned={planned}
              threadBusy={busy}
              onChanged={refresh}
            />
            <ImageStudio key={id} owner={{ type: "trip", id }} purpose="card" defaultShape="portrait" fileStem={fileStem(trip.title, "trip")} />
          </div>
        </div>
      </main>
    </>
  );
}
