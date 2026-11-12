import type { EvalCase, Score, TargetOutput } from "../types.js";
import { conceptRecall, edgeRecall } from "./recall.js";
import { extracted, grounding, latency, sizeInRange, structure } from "./structure.js";

/** Every scorer is a pure function of (output, case): no API calls, so a run can be rescored for free. */
export function scoreTrial(out: TargetOutput, c: EvalCase): Score[] {
  return [extracted(out), structure(out, c), grounding(out, c), conceptRecall(out, c), edgeRecall(out, c), sizeInRange(out, c), latency(out)];
}

export const trialPasses = (scores: Score[]): boolean => scores.every((s) => !s.gate || s.pass);
