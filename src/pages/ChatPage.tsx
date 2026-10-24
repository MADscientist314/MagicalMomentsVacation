import { useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconPlus, IconSend } from "@tabler/icons-react";
import { CastleAtDusk } from "../art/CastleAtDusk";
import { CopyButton } from "../components/CopyButton";
import { MicButton } from "../components/MicButton";
import { Sparkles } from "../components/Sparkles";
import { chatStore, useChat } from "../lib/chatStore";
import { renderMarkdown } from "../lib/markdown";
import { joinTranscript } from "../lib/speech";

const STARTERS = [
  "What's new at Walt Disney World this year?",
  "A family is torn between Disney and Universal for a first trip. What should I ask them?",
  "Give me three Facebook post ideas for this month.",
];

export function ChatPage() {
  const chat = useChat();
  const [input, setInput] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const busy = chat.phase !== "idle";

  // A message that failed before any reply comes back to the box to resend.
  useEffect(() => {
    if (chat.restore) setInput(chat.restore);
  }, [chat.restore]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [chat.turns, chat.phase]);

  const send = (text: string) => {
    const problem = chatStore.send(text);
    setBlocked(problem);
    if (!problem) setInput("");
  };

  return (
    <>
      <header className="hero">
        <CastleAtDusk />
        <div className="banner-text">
          <a className="back" href="#/">
            <IconArrowLeft size={16} aria-hidden />
            All tools
          </a>
          <h1>Ask me anything</h1>
        </div>
      </header>
      <main className="page chat">
        <section className="card chat-thread" aria-live="polite">
          {chat.turns.length === 0 && !busy && (
            <div className="chat-empty">
              <p>
                Ask about parks, ships, clients or marketing — type below, or tap the microphone and just talk.
              </p>
              <div className="starters">
                {STARTERS.map((s) => (
                  <button key={s} type="button" className="btn-quiet" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.turns.map((t, i) => {
            const last = i === chat.turns.length - 1;
            return t.role === "user" ? (
              <div key={i} className="bubble bubble-user">
                {t.content}
              </div>
            ) : (
              <div key={i} className="bubble bubble-assistant">
                <div className="draft-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(t.content) }} />
                {t.sources && t.sources.length > 0 && (
                  <ul className="sources">
                    {t.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {!(busy && last) && (
                  <div className="bubble-actions">
                    <CopyButton markdown={t.content} />
                  </div>
                )}
              </div>
            );
          })}
          {(chat.phase === "waiting" || chat.phase === "searching") && (
            <div className="bubble bubble-assistant waiting-bubble">
              <Sparkles />
              <span>{chat.phase === "searching" ? "Checking the latest info…" : "Sprinkling pixie dust…"}</span>
            </div>
          )}
          <div ref={bottom} />
        </section>

        {(blocked || chat.error) && (
          <p className="message message-error" role="alert">
            {blocked ?? chat.error}
          </p>
        )}
        {chat.notice && <p className="message message-info">{chat.notice}</p>}

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Your message
          </label>
          <textarea
            id="chat-input"
            rows={2}
            maxLength={4000}
            value={input}
            placeholder="Type or tap the microphone to talk…"
            onChange={(e) => {
              setInput(e.target.value);
              setBlocked(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <MicButton onSpeech={(heard) => setInput((v) => joinTranscript(v, heard))} disabled={busy} />
          <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
            <IconSend size={18} aria-hidden />
            Send
          </button>
        </form>
        {chat.turns.length > 0 && (
          <div className="actions">
            <button type="button" className="btn-quiet" onClick={() => chatStore.reset()}>
              <IconPlus size={16} aria-hidden />
              New chat
            </button>
          </div>
        )}
      </main>
    </>
  );
}
