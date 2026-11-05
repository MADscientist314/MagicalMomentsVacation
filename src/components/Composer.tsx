import { useEffect, useState } from "react";
import { IconSend } from "@tabler/icons-react";
import { MAX_MESSAGE } from "../../shared/conversations";
import { joinTranscript } from "../lib/speech";
import { AttachButton, AttachStatus, useAttach } from "./AttachButton";
import { MicButton } from "./MicButton";
import { TextBox } from "./TextBox";

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

const TOO_LONG = `That's too long for one message — keep it under ${MAX_MESSAGE.toLocaleString("en-US")} characters.`;

export function Composer({ onSend, busy, placeholder, restore, error, notice }: Props) {
  const [input, setInput] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const edit = (value: string) => {
    setInput(value);
    setBlocked(null);
  };
  const attacher = useAttach(input, edit, MAX_MESSAGE);
  const tooLong = input.length > MAX_MESSAGE;

  useEffect(() => {
    if (restore) setInput(restore);
  }, [restore]);

  const send = async () => {
    if (!input.trim() || busy || attacher.reading) return;
    if (tooLong) return setBlocked(TOO_LONG);
    const problem = await onSend(input);
    setBlocked(problem);
    if (!problem) {
      setInput("");
      attacher.dismiss();
    }
  };

  return (
    <>
      {(blocked || error) && (
        <p className="message message-error" role="alert">
          {blocked ?? error}
        </p>
      )}
      {notice && <p className="message message-info">{notice}</p>}
      <AttachStatus attacher={attacher} />
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
        <TextBox
          id="composer-input"
          rows={2}
          maxHeight={300}
          limit={MAX_MESSAGE}
          value={input}
          placeholder={placeholder}
          onChange={edit}
          onFiles={(files) => void attacher.attach(files)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <AttachButton attacher={attacher} disabled={busy} />
        <MicButton onSpeech={(heard) => setInput((v) => joinTranscript(v, heard))} disabled={busy} />
        <button type="submit" className="btn-primary" disabled={busy || !input.trim() || tooLong || attacher.reading !== null}>
          <IconSend size={18} aria-hidden />
          Send
        </button>
      </form>
    </>
  );
}
