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

export function buildSystem(tool: ToolId): Anthropic.TextBlockParam[] {
  const skill = stripFrontmatter(BRAINS[`skills/${tool}`]);
  const extras = skillReferences(skill).filter((r) => !SHARED_REFERENCES.includes(r));
  return [
    { type: "text", text: SHARED_REFERENCES.map(reference).join("\n\n---\n\n") },
    {
      type: "text",
      text: [...extras.map(reference), skill].join("\n\n---\n\n"),
      cache_control: { type: "ephemeral" },
    },
  ];
}

export function buildUserMessage(tool: ToolId, fields: Record<string, string>): string {
  return TOOLS[tool].fields
    .filter((f) => fields[f.id]?.trim())
    .map((f) => `**${f.label}:** ${fields[f.id].trim()}`)
    .join("\n");
}
