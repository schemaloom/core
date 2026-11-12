import { readFileSync } from "node:fs";
import { pct } from "./src/report.js";
import type { RunRecord } from "./src/types.js";

const [pa, pb] = process.argv.slice(2);
if (!pa || !pb) {
  console.error("usage: npm run eval:compare -- <runA.json> <runB.json>");
  process.exit(1);
}
const load = (p: string) => JSON.parse(readFileSync(p, "utf8")) as RunRecord;
const a = load(pa), b = load(pb);

if (a.datasetHash !== b.datasetHash) console.warn("Warning: dataset hashes differ; only cases present in both are compared.");
if (a.promptVersion !== b.promptVersion) console.log(`Prompt version: ${a.promptVersion} -> ${b.promptVersion}`);
const diffs = (Object.keys(a.config) as (keyof RunRecord["config"])[])
  .filter((k) => k !== "caseIds" && JSON.stringify(a.config[k]) !== JSON.stringify(b.config[k]))
  .map((k) => `${k}: ${JSON.stringify(a.config[k])} -> ${JSON.stringify(b.config[k])}`);
if (diffs.length) console.log(`Config changes: ${diffs.join(", ")}`);

const common = Object.keys(a.summary.byCase).filter((id) => id in b.summary.byCase).sort();
const flips = common
  .map((id) => ({ id, before: a.summary.byCase[id].passRate, after: b.summary.byCase[id].passRate }))
  .filter((x) => x.before !== x.after);
const fmt = (f: { id: string; before: number; after: number }) => `${f.id} (${pct(f.before)} -> ${pct(f.after)})`;

console.log(`\nPass rate ${pct(a.summary.passRate)} -> ${pct(b.summary.passRate)}  (${common.length} common cases)`);
console.log(`Consistent cases ${a.summary.consistentCases}/${a.summary.cases} -> ${b.summary.consistentCases}/${b.summary.cases}`);
for (const name of ["conceptRecall", "edgeRecall", "grounding"]) {
  const x = a.summary.meanScores[name], y = b.summary.meanScores[name];
  if (x !== undefined && y !== undefined) console.log(`Mean ${name} ${x.toFixed(2)} -> ${y.toFixed(2)}`);
}
// Regressions first: a change that fixes 4 cases and breaks 2 is not simply "+2".
const regressed = flips.filter((f) => f.after < f.before);
const fixed = flips.filter((f) => f.after > f.before);
console.log(`\nRegressed (${regressed.length}):`, regressed.length ? "\n  " + regressed.map(fmt).join("\n  ") : "none");
console.log(`Fixed (${fixed.length}):`, fixed.length ? "\n  " + fixed.map(fmt).join("\n  ") : "none");
