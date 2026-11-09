import { useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { copyRich } from "../lib/clipboard";
import { linksAsText } from "../lib/emailDraft";
import { renderMarkdown } from "../lib/markdown";

/** What a plain-text paste gets: no ** or #, and a link as "its words: its address". */
export const plainText = (markdown: string) => linksAsText(markdown.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, ""));

/** Copies markdown as formatted text plus a plain-text version. */
export function CopyButton({ markdown, label = "Copy" }: { markdown: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const plain = plainText(markdown);
  return (
    <button
      type="button"
      className="btn-quiet"
      onClick={async () => {
        await copyRich(renderMarkdown(markdown), plain);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <IconCheck size={16} aria-hidden /> : <IconCopy size={16} aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}
