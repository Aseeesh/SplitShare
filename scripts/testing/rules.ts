/**
 * Keyword retrieval over the project's business rules (.claude/CLAUDE.md).
 * Usage: pnpm tsx scripts/testing/rules.ts "payment confirm"
 * Prints the matching sections, best match first, plus the spec files that
 * already cite each section (so gaps are visible).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const doc = readFileSync(".claude/CLAUDE.md", "utf8");
const sections = doc.split(/^(?=## §)/m).filter((s) => s.startsWith("## §"));
const terms = process.argv.slice(2).join(" ").toLowerCase().split(/\W+/).filter(Boolean);

function specs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? specs(join(dir, e.name))
      : /\.(spec|test)\.ts$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}
const files = specs("tests").map((f) => ({ f, text: readFileSync(f, "utf8") }));

const ranked = sections
  .map((s) => ({
    s,
    score: terms.reduce((n, t) => n + (s.toLowerCase().split(t).length - 1), 0),
  }))
  .filter((r) => r.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 4);

for (const { s } of ranked) {
  const id = /^## (§\S+)/.exec(s)![1]!;
  const cited = files.filter((x) => x.text.includes(id)).map((x) => x.f);
  console.log(
    `${s.trim()}\n\n>> specs citing ${id}: ${cited.join(", ") || "NONE"}\n${"-".repeat(60)}`,
  );
}
if (ranked.length === 0) console.log("no matching rules");
