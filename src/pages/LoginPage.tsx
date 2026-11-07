import { useState } from "react";
import { IconSparkles } from "@tabler/icons-react";
import { FireworksNight } from "../art/FireworksNight";
import { rememberPassword, SAVED_AS, signIn } from "../lib/session";

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
            if (message) return setError(message);
            // Not awaited: Chrome may hold the promise until she answers its "Save password?" bubble.
            void rememberPassword(password);
            onSignedIn();
          }}
        >
          {/* Password managers save a password under a username, so give them one (Chrome, Safari). */}
          <input type="text" name="username" autoComplete="username" value={SAVED_AS} readOnly hidden />
          <label className="field" htmlFor="password">
            <span className="field-label">Magic words</span>
            <input
              id="password"
              name="password"
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
