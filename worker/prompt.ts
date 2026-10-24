import type Anthropic from "@anthropic-ai/sdk";
import { BRAINS } from "./brains";
import { TOOLS, type ToolId } from "../shared/tools";

// Every tool gets these, in this order, as the first (shared, cacheable) block.
const SHARED_REFERENCES = ["voice", "business", "compliance"];
const REFERENCE_MENTION = /references\/([a-z-]+)\.md/g;

export function stripFrontmatter(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

export function skillReferences(skillBody: string): string[] {
  return [...new Set([...skillBody.matchAll(REFERENCE_MENTION)].map((m) => m[1]))];
}

function reference(name: string): string {
  const text = BRAINS[`reference/${name}`];
  if (text === undefined) throw new Error(`Skill mentions unknown reference: ${name}`);
  // Label each file with the path the skill text uses, so "read references/x.md" resolves.
  return `# File: references/${name}.md\n\n${text.trim()}`;
}

/** Shared reference pack first (same bytes for every tool), then the rest, cached together. */
function systemFor(instructions: string): Anthropic.TextBlockParam[] {
  const extras = skillReferences(instructions).filter((r) => !SHARED_REFERENCES.includes(r));
  return [
    { type: "text", text: SHARED_REFERENCES.map(reference).join("\n\n---\n\n") },
    {
      type: "text",
      text: [...extras.map(reference), instructions].join("\n\n---\n\n"),
      cache_control: { type: "ephemeral" },
    },
  ];
}

export function buildSystem(tool: ToolId): Anthropic.TextBlockParam[] {
  return systemFor(stripFrontmatter(BRAINS[`skills/${tool}`]));
}

export function buildChatSystem(): Anthropic.TextBlockParam[] {
  return systemFor(BRAINS.chat.trim());
}

export function buildUserMessage(tool: ToolId, fields: Record<string, string>): string {
  return TOOLS[tool].fields
    .filter((f) => fields[f.id]?.trim())
    .map((f) => `**${f.label}:** ${fields[f.id].trim()}`)
    .join("\n");
}
