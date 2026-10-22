import { useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { copyRich } from "../lib/clipboard";
import { renderMarkdown } from "../lib/markdown";

/** Copies markdown as formatted text plus a plain-text version. */
export function CopyButton({ markdown, label = "Copy" }: { markdown: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const plain = markdown.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "");
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
