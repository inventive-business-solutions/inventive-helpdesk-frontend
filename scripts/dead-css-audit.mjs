/**
 * Class selectors in globals.css that nothing renders.
 *
 * The sheet outlives the markup. A component gets restructured, its old classes stay behind,
 * and nothing ever fails — dead CSS has no symptom, it just makes the file longer and every
 * future search noisier. This found ~110 lines on its first run: a whole Combobox block for
 * a component that no longer exists, plus leftovers from the product row-list restructure.
 *
 * Run with `npm run audit:deadcss`. Exits 1 on a finding, so it can gate a command.
 *
 * DYNAMIC below is the important part. Classes assembled at runtime — `t-${tone}`,
 * `"type-" + type` — appear nowhere in the source as literals, so a naive check reports
 * them as dead. Acting on that would have deleted every badge tone in the app. A checker
 * that has to be second-guessed is worse than no checker, so the exceptions are listed
 * here, with the expression that builds them.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Built at runtime, so never present as a literal. Keep the source of each one. */
const DYNAMIC = new Set([
  // ui/Chips.tsx — Badge: `t-${tone}` over BadgeTone.
  "t-accent",
  "t-good",
  "t-warning",
  "t-critical",
  "t-info",
  // lib/helpers.ts — typeClass: "type-" + (t === "New Feature" ? "Feature" : t).
  "type-Improvement",
  "type-Query",
  // ui/AttachmentPreview.tsx — `att-view att-view-${kind}` over AttachmentKind. Only the
  // kinds that can actually be previewed reach it; the others never open this dialog.
  "att-view-image",
  "att-view-pdf",
  "att-view-video",
]);

/** Units and keywords the `.foo` pattern picks up out of values like `0.5rem`. */
const NOT_CLASSES = new Set(["ch", "rem", "em", "vh", "vw", "svh", "fr", "deg", "ms", "s", "px"]);

const sources = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(tsx?|mjs)$/.test(path)) sources.push(readFileSync(path, "utf8"));
  }
})(ROOT);
const blob = sources.join("\n");

const css = readFileSync(join(ROOT, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const classes = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));

const dead = [...classes]
  .filter((c) => !NOT_CLASSES.has(c) && !DYNAMIC.has(c))
  // Substring, not word-boundary: a class can legitimately be written as part of a longer
  // template literal, and a false "dead" verdict here ends in someone deleting live CSS.
  .filter((c) => !blob.includes(c))
  .sort();

console.log("Auditing globals.css — class selectors nothing renders:\n");
if (dead.length) {
  for (const c of dead) console.log(`  .${c}`);
  console.log(`\n  ${dead.length} dead. Check for runtime construction before deleting.`);
} else {
  console.log("  none — every selector in the sheet is reachable from the markup.");
}
process.exit(dead.length ? 1 : 0);
