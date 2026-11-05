import { useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type TextareaHTMLAttributes } from "react";
import { redactSensitive } from "../../shared/guard";
import { isReadableFile, redactionNotice } from "../lib/attachments";
import { pastedText } from "../lib/plainText";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "maxLength" | "onPaste" | "onDrop"> & {
  value: string;
  onChange(value: string): void;
  /** Most characters allowed. A counter shows near it; going over is left for the form to refuse. */
  limit: number;
  /** Files dropped or pasted in. Leave it out where attaching isn't offered. */
  onFiles?(files: File[]): void;
  /** How tall the box can grow, in pixels, before it scrolls. */
  maxHeight?: number;
};

/** Puts text in at the cursor, keeping the browser's undo when it can. */
function insertText(el: HTMLTextAreaElement, text: string, onChange: (value: string) => void) {
  el.focus();
  // execCommand is deprecated, but it's still the only way to keep Undo working after a paste.
  if (document.execCommand?.("insertText", false, text)) return;
  const { selectionStart: start, selectionEnd: end, value } = el;
  onChange(value.slice(0, start) + text + value.slice(end));
  requestAnimationFrame(() => el.setSelectionRange(start + text.length, start + text.length));
}

const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");

/**
 * A text box that grows with what's in it and cleans up pasted emails (HTML code, Gmail's
 * "[image: …]" bits, invisible characters). Card, SSN and passport numbers are taken out of pastes.
 */
export function TextBox({ value, onChange, limit, onFiles, maxHeight = 420, className, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const full = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    el.style.height = `${Math.min(full, maxHeight)}px`;
    el.style.overflowY = full > maxHeight ? "auto" : "hidden";
  }, [value, maxHeight]);

  const paste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files];
    if (onFiles && files.length && files.every(isReadableFile)) {
      e.preventDefault();
      onFiles(files);
      return;
    }
    const cleaned = pastedText(e.clipboardData);
    const redacted = redactSensitive(cleaned ?? e.clipboardData.getData("text/plain"));
    const removed = redactionNotice(redacted.removed);
    setNotice(removed);
    if (cleaned === null && !removed) return;
    e.preventDefault();
    insertText(e.currentTarget, redacted.text, onChange);
  };

  const over = value.length > limit;
  return (
    // A span, not a div, so it can sit inside a <label>.
    <span className={`textbox${dragging ? " dragging" : ""}${className ? ` ${className}` : ""}`}>
      <textarea
        ref={ref}
        {...rest}
        value={value}
        aria-invalid={over || undefined}
        onChange={(e) => {
          onChange(e.target.value);
          if (notice) setNotice(null);
        }}
        onPaste={paste}
        onDragOver={(e) => {
          if (!onFiles || !hasFiles(e)) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          setDragging(false);
          if (!onFiles || !e.dataTransfer.files.length) return;
          e.preventDefault();
          onFiles([...e.dataTransfer.files]);
        }}
      />
      {(notice || value.length > limit * 0.8) && (
        <span className="textbox-foot">
          {notice && <span className="textbox-notice">{notice}</span>}
          {value.length > limit * 0.8 && (
            <span className={`char-count${over ? " over" : ""}`}>
              {value.length.toLocaleString()} / {limit.toLocaleString()}
              {over ? " — too long" : ""}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
