import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadCases, selectCases } from "./src/dataset.js";
import { buildRecord, formatConsole, formatMarkdown } from "./src/report.js";
import { rescore, runEval } from "./src/runner.js";
import { registerStubCases, targets } from "./src/targets.js";
import type { RunConfig, RunRecord } from "./src/types.js";

const here = dirname(fileURLToPath(import.meta.url));

const { values: v } = parseArgs({
  options: {
    split: { type: "string", default: "dev" },
    repeats: { type: "string", default: "3" },
    retries: { type: "string", default: "0" },
    target: { type: "string", default: "library" },
    model: { type: "string", default: "gemini-3-flash-preview" },
    temperature: { type: "string", default: "0" },
    concurrency: { type: "string", default: "3" },
    timeout: { type: "string", default: "120000" },
    case: { type: "string", multiple: true, default: [] },
    "no-cache": { type: "boolean", default: false },
    replay: { type: "string" },
    label: { type: "string" },
  },
});

const num = (name: string, s: string): number => {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, got "${s}"`);
  return n;
};
const oneOf = <T extends string>(name: string, s: string, opts: readonly T[]): T => {
  if (!(opts as readonly string[]).includes(s)) throw new Error(`--${name} must be one of ${opts.join(", ")}`);
  return s as T;
};

function save(record: RunRecord) {
  mkdirSync(join(here, "results"), { recursive: true });
  mkdirSync(join(here, "reports"), { recursive: true });
  const file = join(here, "results", `${record.runId}.json`);
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  writeFileSync(join(here, "reports", `${record.runId}.md`), formatMarkdown(record));
  console.log(`\nSaved eval/results/${record.runId}.json and eval/reports/${record.runId}.md`);
}

async function main() {
  const all = loadCases();

  if (v.replay) {
    const old = JSON.parse(readFileSync(v.replay, "utf8")) as RunRecord;
    const { trials, skipped } = rescore(old.trials, all);
    if (skipped.length) console.warn(`Skipped trials for cases no longer in the dataset: ${skipped.join(", ")}`);
    const cases = all.filter((c) => trials.some((t) => t.caseId === c.id));
    const record = buildRecord(trials, cases, old.config, v.label ?? "replay", old.runId);
    console.log(formatConsole(record));
    save(record);
    return;
  }

  const cfg: RunConfig = {
    model: v.model!,
    temperature: num("temperature", v.temperature!),
    retries: num("retries", v.retries!),
    repeats: num("repeats", v.repeats!),
    concurrency: num("concurrency", v.concurrency!),
    timeoutMs: num("timeout", v.timeout!),
    split: oneOf("split", v.split!, ["dev", "test", "all"] as const),
    target: oneOf("target", v.target!, ["library", "api", "stub"] as const),
    useCache: !v["no-cache"],
    caseIds: v.case ?? [],
  };
  const cases = selectCases(all, cfg.split, cfg.caseIds);
  if (!cases.length) throw new Error("No cases selected");
  if (cfg.target !== "stub" && !process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
    console.warn("Warning: no GOOGLE_API_KEY in the environment; uncached trials will fail.");
  }

  if (cfg.target === "stub") registerStubCases(cases);
  console.log(`Running ${cases.length} cases x ${cfg.repeats} repeats (${cfg.target}, ${cfg.model}, cache ${cfg.useCache ? "on" : "off"})`);
  let done = 0;
  const total = cases.length * cfg.repeats;
  const trials = await runEval(cases, cfg, targets[cfg.target], (t) => {
    console.log(`  [${++done}/${total}] ${t.caseId}#${t.trial} ${t.pass ? "pass" : "FAIL"}${t.output.error && !t.output.graph ? `  (${t.output.error.slice(0, 80)})` : ""}`);
  });
  // keep case order stable regardless of completion order
  trials.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.trial - b.trial);

  const label = v.label ?? `${cfg.split}_${cfg.target}_r${cfg.retries}`;
  const record = buildRecord(trials, cases, cfg, label);
  console.log("\n" + formatConsole(record));
  save(record);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
