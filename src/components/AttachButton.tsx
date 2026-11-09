import { useRef, useState } from "react";
import { IconPaperclip } from "@tabler/icons-react";
import { appendBlock, ATTACH_ACCEPT, AttachError, readAttachment, roomFor } from "../lib/attachments";

export interface Attacher {
  /** The file being read, or null. */
  reading: string | null;
  message: { tone: "info" | "error"; text: string } | null;
  attach(files: File[]): Promise<void>;
  dismiss(): void;
}

/** Reads attached files one at a time and adds each one's text to the end of the box. */
export function useAttach(value: string, onChange: (value: string) => void, limit: number): Attacher {
  const latest = useRef(value);
  latest.current = value;
  const [reading, setReading] = useState<string | null>(null);
  const [message, setMessage] = useState<Attacher["message"]>(null);

  const attach = async (files: File[]) => {
    if (reading || !files.length) return;
    const notes: string[] = [];
    setMessage(null);
    for (const file of files) {
      setReading(file.name);
      try {
        const read = await readAttachment(file, roomFor(latest.current, limit));
        latest.current = appendBlock(latest.current, read.block);
        onChange(latest.current);
        if (read.notice) notes.push(files.length > 1 ? `${file.name}: ${read.notice}` : read.notice);
      } catch (err) {
        if (!(err instanceof AttachError)) console.error(err);
        const text = err instanceof AttachError ? err.message : "I couldn't read that file. Try again, or paste its text in instead.";
        setMessage({ tone: "error", text: files.length > 1 ? `${file.name}: ${text}` : text });
        setReading(null);
        return;
      }
    }
    setReading(null);
    setMessage(notes.length ? { tone: "info", text: notes.join(" ") } : null);
  };

  return { reading, message, attach, dismiss: () => setMessage(null) };
}

/** The paperclip: pick a screenshot or photo, a PDF, a saved email, a web page or a text file. */
export function AttachButton({ attacher, disabled }: { attacher: Attacher; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const label = "Attach a screenshot, PDF or saved email";
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ATTACH_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void attacher.attach(files);
        }}
      />
      <button
        type="button"
        className="btn-attach"
        aria-label={label}
        title={label}
        disabled={disabled || attacher.reading !== null}
        onClick={() => input.current?.click()}
      >
        <IconPaperclip size={20} aria-hidden />
      </button>
    </>
  );
}

/** "Reading itinerary.pdf…", or what happened with the last file. */
export function AttachStatus({ attacher }: { attacher: Attacher }) {
  if (attacher.reading) return <p className="message message-info attach-status">Reading {attacher.reading}…</p>;
  if (!attacher.message) return null;
  return (
    <p className={`message message-${attacher.message.tone} attach-status`} role={attacher.message.tone === "error" ? "alert" : undefined}>
      {attacher.message.text}{" "}
      <button type="button" className="link-button" onClick={attacher.dismiss}>
        OK
      </button>
    </p>
  );
}
