import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROMPT_VERSION } from "../../src/extraction/schemaLoomExtractor.js";
import type { EvalCase, RunConfig, TargetOutput } from "./types.js";

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache");

/**
 * Keyed by everything that can change the model's answer. The trial number is
 * included so repeats are still independent calls, while re-running the same
 * config replays them (so scorers can be changed and re-run for free).
 */
export function cacheKey(c: EvalCase, trial: number, cfg: RunConfig): string {
  return createHash("sha256")
    .update(JSON.stringify({
      text: c.text, trial, model: cfg.model, temperature: cfg.temperature,
      retries: cfg.retries, target: cfg.target, promptVersion: PROMPT_VERSION,
    }))
    .digest("hex");
}

export function readCache(key: string): TargetOutput | null {
  const f = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as TargetOutput;
  } catch {
    return null; // corrupt entry: treat as a miss
  }
}

export function writeCache(key: string, output: TargetOutput): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(output));
}
