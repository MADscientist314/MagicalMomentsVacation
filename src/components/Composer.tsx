import { useEffect, useState } from "react";
import { IconSend } from "@tabler/icons-react";
import { joinTranscript } from "../lib/speech";
import { MicButton } from "./MicButton";

interface Props {
  /** Returns a message to show instead of sending (e.g. a card number was pasted), or null. */
  onSend(text: string): string | null | Promise<string | null>;
  busy: boolean;
  placeholder: string;
  /** Text handed back after a failed send, to put back in the box. */
  restore?: string | null;
  error?: string | null;
  notice?: string | null;
}

export function Composer({ onSend, busy, placeholder, restore, error, notice }: Props) {
  const [input, setInput] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    if (restore) setInput(restore);
  }, [restore]);

  const send = async () => {
    if (!input.trim() || busy) return;
    const problem = await onSend(input);
    setBlocked(problem);
    if (!problem) setInput("");
  };

  return (
    <>
      {(blocked || error) && (
        <p className="message message-error" role="alert">
          {blocked ?? error}
        </p>
      )}
      {notice && <p className="message message-info">{notice}</p>}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="composer-input" className="sr-only">
          Your message
        </label>
        <textarea
          id="composer-input"
          rows={2}
          maxLength={4000}
          value={input}
          placeholder={placeholder}
          onChange={(e) => {
            setInput(e.target.value);
            setBlocked(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <MicButton onSpeech={(heard) => setInput((v) => joinTranscript(v, heard))} disabled={busy} />
        <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
          <IconSend size={18} aria-hidden />
          Send
        </button>
      </form>
    </>
  );
}
