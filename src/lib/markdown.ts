import DOMPurify from "dompurify";
import { marked } from "marked";

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false, gfm: true, breaks: true }));
}
