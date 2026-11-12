import pLimit from "p-limit";
import { cacheKey, readCache, writeCache } from "./cache.js";
import { scoreTrial, trialPasses } from "./scorers/index.js";
import type { Target } from "./targets.js";
import type { EvalCase, RunConfig, TargetOutput, TrialResult } from "./types.js";

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export async function runEval(
  cases: EvalCase[], cfg: RunConfig, target: Target, onTrial?: (t: TrialResult) => void
): Promise<TrialResult[]> {
  const limit = pLimit(cfg.concurrency);
  const jobs = cases.flatMap((c) =>
    Array.from({ length: cfg.repeats }, (_, trial) =>
      limit(async () => {
        const result = await runTrial(c, trial, cfg, target);
        onTrial?.(result);
        return result;
      })
    )
  );
  return Promise.all(jobs);
}

/** A failure is a result, not a crash: one timeout must never kill a long run. */
export async function runTrial(c: EvalCase, trial: number, cfg: RunConfig, target: Target): Promise<TrialResult> {
  const key = cacheKey(c, trial, cfg);
  let output: TargetOutput | null = cfg.useCache ? readCache(key) : null;

  if (!output) {
    const start = Date.now();
    try {
      output = await withTimeout(target(c.text, cfg), cfg.timeoutMs);
      // Only successful calls are cached, so a transient API error is retried next run.
      if (output.graph) writeCache(key, output);
    } catch (e) {
      output = { graph: null, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start, attempts: 0 };
    }
  }

  const scores = scoreTrial(output, c);
  return { caseId: c.id, trial, output, scores, pass: trialPasses(scores) };
}

/** Rescore stored outputs with the current scorers and dataset; no API calls. */
export function rescore(trials: TrialResult[], cases: EvalCase[]): { trials: TrialResult[]; skipped: string[] } {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const skipped = new Set<string>();
  const out: TrialResult[] = [];
  for (const t of trials) {
    const c = byId.get(t.caseId);
    if (!c) { skipped.add(t.caseId); continue; }
    const scores = scoreTrial(t.output, c);
    out.push({ ...t, scores, pass: trialPasses(scores) });
  }
  return { trials: out, skipped: [...skipped] };
}
