import { execSync } from "node:child_process";
import { PROMPT_VERSION } from "../../src/extraction/schemaLoomExtractor.js";
import type { EvalCase, RunConfig, RunRecord, RunSummary, TrialResult } from "./types.js";
import { hashDataset } from "./dataset.js";

// ------------------------------------------------------------ small stats helpers

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Nearest-rank percentile. */
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

export function groupBy<T>(xs: T[], key: (x: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of xs) (out[key(x)] ??= []).push(x);
  return out;
}

const passRateOf = (ts: TrialResult[]) => mean(ts.map((t) => (t.pass ? 1 : 0)));
export const pct = (x: number) => `${Math.round(x * 100)}%`;

// ------------------------------------------------------------ summary

export function summarize(trials: TrialResult[], cases: EvalCase[]): RunSummary {
  const byCaseTrials = groupBy(trials, (t) => t.caseId);
  const byCase = Object.fromEntries(
    Object.entries(byCaseTrials).map(([id, ts]) => [id, { passRate: passRateOf(ts), trials: ts.length }])
  );

  const allScores = trials.flatMap((t) => t.scores);
  const meanScores = Object.fromEntries(
    Object.entries(groupBy(allScores, (s) => s.name)).map(([n, ss]) => [n, mean(ss.map((s) => s.value))])
  );

  const failuresByScorer: Record<string, number> = {};
  const failuresByIssue: Record<string, number> = {};
  let reversed = 0;
  for (const t of trials) {
    for (const s of t.scores) {
      if (s.gate && !s.pass) failuresByScorer[s.name] = (failuresByScorer[s.name] ?? 0) + 1;
      if (s.name === "structure") {
        for (const type of (s.details?.issueTypes as string[] | undefined) ?? []) {
          failuresByIssue[type] = (failuresByIssue[type] ?? 0) + 1;
        }
      }
      if (s.name === "edgeRecall") reversed += (s.details?.reversed as number | undefined) ?? 0;
    }
    if (t.scores.some((s) => s.name === "grounding" && !s.pass) && t.output.graph) {
      failuresByIssue["ungrounded_node"] = (failuresByIssue["ungrounded_node"] ?? 0) + 1;
    }
    if (t.output.error && !t.output.graph) {
      const kind = /timeout/.test(t.output.error) ? "timeout" : "call_error";
      failuresByIssue[kind] = (failuresByIssue[kind] ?? 0) + 1;
    }
  }

  const tagsOf = new Map(cases.map((c) => [c.id, c.tags]));
  const tagTrials: Record<string, TrialResult[]> = {};
  for (const t of trials) for (const tag of tagsOf.get(t.caseId) ?? []) (tagTrials[tag] ??= []).push(t);
  const byTag = Object.fromEntries(
    Object.entries(tagTrials).map(([tag, ts]) => [tag, { trials: ts.length, passRate: passRateOf(ts) }])
  );

  const latencies = trials.map((t) => t.output.latencyMs);
  return {
    trials: trials.length,
    cases: Object.keys(byCaseTrials).length,
    passRate: passRateOf(trials),
    consistentCases: Object.values(byCase).filter((c) => c.passRate === 1).length,
    meanScores,
    failuresByScorer,
    failuresByIssue,
    reversedEdges: reversed,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    tokens: {
      input: trials.reduce((a, t) => a + (t.output.usage?.inputTokens ?? 0), 0),
      output: trials.reduce((a, t) => a + (t.output.usage?.outputTokens ?? 0), 0),
    },
    byTag,
    byCase,
  };
}

// ------------------------------------------------------------ run record

function git(cmd: string): string {
  try { return execSync(`git ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}

export function buildRecord(
  trials: TrialResult[], cases: EvalCase[], cfg: RunConfig, label: string, replayOf?: string
): RunRecord {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace(":", "-");
  return {
    runId: `${stamp}_${label}`,
    createdAt: now.toISOString(),
    gitCommit: git("rev-parse HEAD") || "unknown",
    gitDirty: git("status --porcelain").length > 0,
    datasetHash: hashDataset(cases),
    promptVersion: PROMPT_VERSION,
    config: cfg,
    ...(replayOf ? { replayOf } : {}),
    trials,
    summary: summarize(trials, cases),
  };
}

// ------------------------------------------------------------ console + markdown

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const f2 = (x: number | undefined) => (x ?? 0).toFixed(2);

export function formatConsole(r: RunRecord): string {
  const s = r.summary, c = r.config;
  const passed = Math.round(s.passRate * s.trials);
  const lines = [
    `Run ${r.runId}  (${c.split}, ${s.cases} cases x ${c.repeats} repeats, ${c.model}, temp ${c.temperature}, target ${c.target})`,
    `Pass rate        ${pct(s.passRate)} (${passed}/${s.trials} trials)`,
    `Consistent       ${s.consistentCases}/${s.cases} cases passed all ${c.repeats} repeats`,
    `Concept recall   ${f2(s.meanScores.conceptRecall)}    Edge recall ${f2(s.meanScores.edgeRecall)} (${s.reversedEdges} reversed)`,
    `Latency          p50 ${sec(s.latencyP50)}   p95 ${sec(s.latencyP95)}    Tokens ${s.tokens.input} in / ${s.tokens.output} out`,
    "",
    "Failures (gate scorers, trials)",
    ...entries(s.failuresByScorer),
    "",
    "Failures (by issue type, trials)",
    ...entries(s.failuresByIssue),
    "",
    "Per case (pass rate)",
    ...Object.entries(s.byCase).map(([id, v]) => `  ${id.padEnd(26)}${pct(v.passRate)}`),
  ];
  return lines.join("\n");
}

function entries(o: Record<string, number>): string[] {
  const e = Object.entries(o).sort((a, b) => b[1] - a[1]);
  return e.length ? e.map(([k, v]) => `  ${k.padEnd(18)}${v}`) : ["  none"];
}

export function formatMarkdown(r: RunRecord): string {
  const s = r.summary, c = r.config;
  const table = (rows: [string, string][], head: [string, string]) =>
    [`| ${head[0]} | ${head[1]} |`, "|---|---|", ...rows.map(([a, b]) => `| ${a} | ${b} |`)].join("\n");
  return [
    `# Eval run ${r.runId}`,
    "",
    `- Split: **${c.split}** (${s.cases} cases x ${c.repeats} repeats = ${s.trials} trials)`,
    `- Target: ${c.target}, model ${c.model}, temperature ${c.temperature}, retries ${c.retries}`,
    `- Commit: \`${r.gitCommit.slice(0, 7)}\`${r.gitDirty ? " (dirty)" : ""}, dataset \`${r.datasetHash}\`, prompt v${r.promptVersion}`,
    r.replayOf ? `- Rescored from run \`${r.replayOf}\` (no API calls)` : "",
    "",
    "## Summary",
    "",
    table([
      ["Pass rate", `${pct(s.passRate)} (${Math.round(s.passRate * s.trials)}/${s.trials} trials)`],
      ["Consistent cases", `${s.consistentCases}/${s.cases} passed every repeat`],
      ...Object.entries(s.meanScores).filter(([n]) => n !== "latency").map(([n, v]): [string, string] => [`Mean ${n}`, f2(v)]),
      ["Reversed edges", String(s.reversedEdges)],
      ["Latency p50 / p95", `${sec(s.latencyP50)} / ${sec(s.latencyP95)}`],
      ["Tokens in / out", `${s.tokens.input} / ${s.tokens.output}`],
    ], ["Metric", "Value"]),
    "",
    "## Failures",
    "",
    table(Object.entries(s.failuresByScorer).map(([k, v]) => [k, String(v)]), ["Gate scorer", "Failed trials"]),
    "",
    table(Object.entries(s.failuresByIssue).map(([k, v]) => [k, String(v)]), ["Issue type", "Trials"]),
    "",
    "## By tag",
    "",
    table(Object.entries(s.byTag).sort().map(([k, v]) => [k, `${pct(v.passRate)} (${v.trials} trials)`]), ["Tag", "Pass rate"]),
    "",
    "## By case",
    "",
    table(Object.entries(s.byCase).map(([k, v]) => [k, pct(v.passRate)]), ["Case", "Pass rate"]),
    "",
  ].join("\n");
}
