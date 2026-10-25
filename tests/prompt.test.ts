import { describe, expect, it } from "vitest";
import { BRAINS } from "../worker/brains";
import { buildSystem, buildUserMessage, skillReferences, stripFrontmatter } from "../worker/prompt";
import { TOOLS, type ToolId } from "../shared/tools";

const ALL_TOOLS = Object.keys(TOOLS) as ToolId[];

describe("stripFrontmatter", () => {
  it("removes the YAML block", () => {
    expect(stripFrontmatter("---\nname: x\n---\nBody")).toBe("Body");
  });

  it("leaves text without frontmatter alone", () => {
    expect(stripFrontmatter("Just text")).toBe("Just text");
  });
});

describe("skillReferences", () => {
  it("finds fit-rules in the welcome-center skill", () => {
    expect(skillReferences(BRAINS["skills/welcome-center"])).toContain("fit-rules");
  });

  it("lists each reference once", () => {
    const refs = skillReferences("read references/voice.md and again references/voice.md");
    expect(refs).toEqual(["voice"]);
  });
});

describe("buildSystem", () => {
  it("includes Jillian's fit rules for the welcome center", () => {
    expect(buildSystem("welcome-center")[1].text).toContain(BRAINS["reference/fit-rules"].trim());
  });

  it("leaves booking windows out of client emails", () => {
    expect(buildSystem("magic-mail")[1].text).not.toContain("Booking windows cheat sheet");
  });

  it("includes booking windows for trip plans", () => {
    expect(buildSystem("adventure-planner")[1].text).toContain("Booking windows cheat sheet");
  });

  it("puts the shared reference pack first and caches after the skill", () => {
    const blocks = buildSystem("spread-the-magic");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toContain("Jillian's voice");
    expect(blocks[0].text).toContain("Required legal footer");
    expect(blocks[1].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1].text).toContain("You are drafting for Jillian Jochum's travel business.");
  });

  it("never sends skill frontmatter", () => {
    for (const tool of ALL_TOOLS) {
      for (const block of buildSystem(tool)) expect(block.text).not.toMatch(/^name: /m);
    }
  });

  it("is byte-identical across calls so prompt caching works", () => {
    for (const tool of ALL_TOOLS) {
      expect(JSON.stringify(buildSystem(tool))).toBe(JSON.stringify(buildSystem(tool)));
    }
  });
});

describe("Inbox Helper prompt", () => {
  it("uses the inbox-helper skill with her voice and footer", () => {
    const text = buildSystem("inbox-helper").map((b) => b.text).join("\n");
    expect(text).toContain("Inbox Helper");
    expect(text).toContain("Required legal footer");
  });
});

describe("buildUserMessage", () => {
  it("writes one labelled line per filled field in form order", () => {
    expect(buildUserMessage("magic-mail", { clientNames: "The Smiths", emailType: "Welcome" })).toBe(
      "**Which email?:** Welcome\n**Client names:** The Smiths",
    );
  });

  it("skips blank fields and ignores unknown ones", () => {
    expect(buildUserMessage("magic-mail", { emailType: "Welcome", trip: "  ", bogus: "x" })).toBe(
      "**Which email?:** Welcome",
    );
  });
});
