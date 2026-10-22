// Builds the Claude app plugin from brains/.
//
//   node scripts/build-plugin.mjs           writes plugin/magical-vacations/ and dist-plugin/magical-vacations.zip
//   node scripts/build-plugin.mjs --check   writes nothing; exits 1 if plugin/ is out of date with brains/
//
// Each skill gets its own copy of the reference files its SKILL.md mentions
// (as `references/<name>.md`), because a skill can only rely on files in its own folder.
// The version (1.0.N) goes up only when the generated files actually change.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRAINS = join(ROOT, "brains");
const OUT = join(ROOT, "plugin", "magical-vacations");
const ZIP = join(ROOT, "dist-plugin", "magical-vacations.zip");
const MANIFEST = ".claude-plugin/plugin.json";
const DESCRIPTION =
  "Drafting helpers for Jillian Jochum's travel business: client emails, inquiry review, compliant marketing posts and trip plans.";

function desiredFiles() {
  const files = new Map();
  for (const skill of readdirSync(join(BRAINS, "skills")).sort()) {
    const text = readFileSync(join(BRAINS, "skills", skill, "SKILL.md"), "utf8");
    files.set(`skills/${skill}/SKILL.md`, text);
    const refs = [...new Set([...text.matchAll(/references\/([a-z-]+)\.md/g)].map((m) => m[1]))];
    for (const ref of refs) {
      const source = join(BRAINS, "reference", `${ref}.md`);
      if (!existsSync(source)) throw new Error(`${skill}/SKILL.md mentions missing reference: ${ref}.md`);
      files.set(`skills/${skill}/references/${ref}.md`, readFileSync(source, "utf8"));
    }
  }
  return files;
}

function existingFiles(dir) {
  const files = new Map();
  if (!existsSync(dir)) return files;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.set(relative(dir, path).split(sep).join("/"), readFileSync(path, "utf8"));
    }
  };
  walk(dir);
  files.delete(MANIFEST);
  return files;
}

const desired = desiredFiles();
const existing = existingFiles(OUT);
const stale = [
  ...[...desired].filter(([path, text]) => existing.get(path) !== text).map(([path]) => path),
  ...[...existing.keys()].filter((path) => !desired.has(path)),
];
const manifestPath = join(OUT, MANIFEST);
const hasManifest = existsSync(manifestPath);

if (process.argv.includes("--check")) {
  if (stale.length || !hasManifest) {
    console.log("The Claude plugin is out of date with brains/. Run `npm run build:plugin`. Changed:");
    for (const path of stale.length ? stale : [MANIFEST]) console.log(`  ${path}`);
    process.exit(1);
  }
  console.log("The Claude plugin is up to date.");
  process.exit(0);
}

const previous = hasManifest ? Number(JSON.parse(readFileSync(manifestPath, "utf8")).version?.split(".")[2] ?? 0) : 0;
const version = `1.0.${stale.length || !hasManifest ? previous + 1 : previous}`;
const manifest = {
  name: "magical-vacations",
  displayName: "Magical Vacations by Jillian",
  version,
  description: DESCRIPTION,
  author: { name: "Michael Jochum" },
};

rmSync(OUT, { recursive: true, force: true });
const all = new Map([[MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`], ...desired]);
for (const [path, text] of all) {
  mkdirSync(dirname(join(OUT, path)), { recursive: true });
  writeFileSync(join(OUT, path), text);
}

// Fixed timestamps keep the zip byte-identical between builds of the same content.
const mtime = new Date("2026-01-01T00:00:00Z");
const entries = Object.fromEntries([...all].map(([path, text]) => [path, [new TextEncoder().encode(text), { mtime }]]));
mkdirSync(dirname(ZIP), { recursive: true });
writeFileSync(ZIP, zipSync(entries, { level: 9 }));

console.log(`Built Claude plugin ${version}${stale.length ? ` (${stale.length} file(s) changed)` : ""}`);
console.log(`  folder: ${relative(ROOT, OUT)}`);
console.log(`  zip:    ${relative(ROOT, ZIP)}`);
