import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const PLUGIN = join(ROOT, "plugin", "magical-vacations");
const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/build-plugin.mjs", ...args], { cwd: ROOT, encoding: "utf8" });

beforeAll(() => {
  const build = run();
  expect(build.status, build.stderr).toBe(0);
});

describe("build-plugin", () => {
  it("reports the plugin as up to date right after a build", () => {
    const check = run("--check");
    expect(check.status, check.stdout + check.stderr).toBe(0);
  });

  it("copies the shared fit rules into the welcome-center skill", () => {
    expect(readFileSync(join(PLUGIN, "skills/welcome-center/references/fit-rules.md"), "utf8")).toBe(
      readFileSync(join(ROOT, "brains/reference/fit-rules.md"), "utf8"),
    );
  });

  it("leaves booking windows out of the client-email skill", () => {
    expect(readdirSync(join(PLUGIN, "skills/magic-mail/references")).sort()).toEqual([
      "business.md",
      "compliance.md",
      "voice.md",
    ]);
  });

  it("keeps only name and description in every skill's frontmatter", () => {
    for (const skill of readdirSync(join(PLUGIN, "skills"))) {
      const text = readFileSync(join(PLUGIN, "skills", skill, "SKILL.md"), "utf8");
      const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
      const keys = front.split("\n").map((l) => l.split(":")[0]);
      expect(keys, skill).toEqual(["name", "description"]);
      expect(front).toContain(`name: ${skill}`);
    }
  });

  it("writes a manifest the Claude app accepts", () => {
    const manifest = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin/plugin.json"), "utf8"));
    expect(manifest.name).toBe("magical-vacations");
    expect(manifest.displayName).toBe("Magical Vacations by Jillian");
    expect(manifest.version).toMatch(/^1\.0\.\d+$/);
  });

  it("zips the plugin with the manifest at the top level", () => {
    const entries = Object.keys(unzipSync(readFileSync(join(ROOT, "dist-plugin/magical-vacations.zip"))));
    expect(entries).toContain(".claude-plugin/plugin.json");
    expect(entries).toContain("skills/adventure-planner/references/booking-windows.md");
  });
});
