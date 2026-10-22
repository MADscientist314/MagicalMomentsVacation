import DOMPurify from "dompurify";
import { marked } from "marked";

// DOMPurify needs a DOM. Where there isn't one (server-side rendering in tests),
// fall back to escaped plain text rather than ever returning unsanitized HTML.
const purify = DOMPurify.isSupported ? DOMPurify : null;

purify?.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderMarkdown(md: string): string {
  if (!purify) return escapeHtml(md);
  return purify.sanitize(marked.parse(md, { async: false, gfm: true, breaks: true }));
}
