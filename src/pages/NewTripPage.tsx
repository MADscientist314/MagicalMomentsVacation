import { useState } from "react";
import { IconArrowLeft } from "@tabler/icons-react";
import { CastleAtDusk } from "../art/CastleAtDusk";
import { TripDetailsForm } from "../components/TripDetailsForm";
import { createTrip } from "../lib/api";
import { clearHandoff, peekHandoff } from "../lib/handoff";
import { planTrip } from "../lib/threadStore";

export function NewTripPage() {
  // Details carried over from a Welcome Center review, if Jillian came from there.
  const [initial] = useState<Record<string, string>>(() => peekHandoff() ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (details: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      const trip = await createTrip(details);
      clearHandoff();
      planTrip(trip.id);
      window.location.hash = `#/trips/${trip.id}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
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
          <h1>New trip</h1>
        </div>
      </header>
      <main className="page narrow">
        <TripDetailsForm initial={initial} submitLabel="Plan it" busy={busy} error={error} onSubmit={(d) => void start(d)} />
      </main>
    </>
  );
}
