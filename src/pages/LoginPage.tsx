import { useState } from "react";
import { IconSparkles } from "@tabler/icons-react";
import { FireworksNight } from "../art/FireworksNight";
import { signIn } from "../lib/session";

export function LoginPage({ onSignedIn }: { onSignedIn(): void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <header className="hero">
        <FireworksNight />
        <div className="hero-text">
          <h1 className="greeting">Welcome, Jillian</h1>
          <p className="hero-sub">Say the magic words to come in.</p>
        </div>
      </header>
      <main className="page login">
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!password.trim() || busy) return;
            setBusy(true);
            const message = await signIn(password);
            setBusy(false);
            if (message) setError(message);
            else onSignedIn();
          }}
        >
          <label className="field" htmlFor="password">
            <span className="field-label">Magic words</span>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          </label>
          {error && (
            <p className="message message-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            <IconSparkles size={18} aria-hidden />
            {busy ? "Opening…" : "Open the gates"}
          </button>
        </form>
      </main>
    </>
  );
}
