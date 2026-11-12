import { checkGraph } from "../../../src/validation/graphChecks.js";
import { ConceptGraphSchema } from "../../../src/schemas/conceptGraphSchema.js";
import type { EvalCase, Score, TargetOutput } from "../types.js";

export function extracted(out: TargetOutput): Score {
  const ok = out.graph !== null && ConceptGraphSchema.safeParse(out.graph).success;
  return { name: "extracted", value: ok ? 1 : 0, pass: ok, gate: true, details: out.error ? { error: out.error } : undefined };
}

/**
 * Wraps checkGraph. Grounding has its own scorer, so ungrounded_node issues are
 * excluded here: each failure then lands in exactly one bucket.
 */
export function structure(out: TargetOutput, c: EvalCase): Score {
  if (!out.graph) return { name: "structure", value: 0, pass: false, gate: true };
  const res = checkGraph(out.graph, c.text);
  const errors = res.issues.filter((i) => i.severity === "error" && i.type !== "ungrounded_node");
  const warnings = res.issues.filter((i) => i.severity === "warning").map((i) => i.type);
  return {
    name: "structure", value: errors.length === 0 ? 1 : 0, pass: errors.length === 0, gate: true,
    details: { issueTypes: [...new Set(errors.map((i) => i.type))], warnings },
  };
}

export function grounding(out: TargetOutput, c: EvalCase, minRatio = 0.8): Score {
  if (!out.graph) return { name: "grounding", value: 0, pass: false, gate: true };
  const { groundedRatio } = checkGraph(out.graph, c.text).stats;
  return { name: "grounding", value: groundedRatio, pass: groundedRatio >= minRatio, gate: true };
}

export function sizeInRange(out: TargetOutput, c: EvalCase): Score {
  const n = out.graph?.nodes.length ?? 0;
  const [lo, hi] = c.expect.nodeCountRange;
  const ok = n >= lo && n <= hi;
  return { name: "sizeInRange", value: ok ? 1 : 0, pass: ok, gate: false, details: { nodes: n, range: [lo, hi] } };
}

export function latency(out: TargetOutput): Score {
  return { name: "latency", value: out.latencyMs, pass: true, gate: false };
}
