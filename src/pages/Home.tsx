import { useState } from "react";
import { IconDoorEnter, IconInbox, IconMailHeart, IconMap2, IconSend, IconWand, type Icon } from "@tabler/icons-react";
import { TOOLS } from "../../shared/tools";
import { FireworksNight } from "../art/FireworksNight";
import { MagicLamp } from "../art/MagicLamp";
import { MicButton } from "../components/MicButton";
import { startChat } from "../lib/startChat";
import { greeting } from "../lib/greeting";
import { joinTranscript } from "../lib/speech";

const ICONS: Record<string, Icon> = {
  "mail-heart": IconMailHeart,
  "door-enter": IconDoorEnter,
  inbox: IconInbox,
  wand: IconWand,
  "map-2": IconMap2,
};

export function Home({ onSignOut }: { onSignOut(): void }) {
  const [question, setQuestion] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);

  const [asking, setAsking] = useState(false);

  const ask = async () => {
    if (!question.trim() || asking) return;
    setAsking(true);
    const started = await startChat(question);
    setAsking(false);
    if ("error" in started) return setBlocked(started.error);
    window.location.hash = `#/chat/${started.id}`;
  };

  return (
    <>
      <header className="hero">
        <FireworksNight />
        <div className="hero-text">
          <h1 className="greeting">{greeting(new Date())}, Jillian</h1>
          <p className="hero-sub">What can I help you with today?</p>
        </div>
      </header>
      <main className="page">
        <nav className="tiles" aria-label="Tools">
          {Object.values(TOOLS).map((t) => {
            const ToolIcon = ICONS[t.icon];
            return (
              <a key={t.id} className="tile" href={t.id === "adventure-planner" ? "#/trips" : `#/${t.id}`}>
                <ToolIcon size={26} aria-hidden />
                <span className="tile-name">{t.name}</span>
                {t.subtitle}
              </a>
            );
          })}
        </nav>
        <form
          className="ask-bar"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <div className="wish-head">
            <MagicLamp size={84} />
            <label htmlFor="ask" className="wish-label">
              Make a wish… or ask me anything
            </label>
          </div>
          <div className="ask-row">
            <input
              id="ask"
              value={question}
              maxLength={4000}
              placeholder="What's new at Disney World this year?"
              onChange={(e) => {
                setQuestion(e.target.value);
                setBlocked(null);
              }}
            />
            <MicButton onSpeech={(heard) => setQuestion((q) => joinTranscript(q, heard))} />
            <button type="submit" className="btn-primary" disabled={!question.trim() || asking}>
              <IconSend size={18} aria-hidden />
              Ask
            </button>
          </div>
          {blocked && (
            <p className="message message-error" role="alert">
              {blocked}
            </p>
          )}
          <a className="ask-link" href="#/chat">
            Open the chat
          </a>
        </form>
        <p className="footnote">
          Everything here is a draft for you to review. Nothing is sent until you send it.{" "}
          <button type="button" className="link-button" onClick={onSignOut}>
            Sign out
          </button>
        </p>
      </main>
    </>
  );
}
