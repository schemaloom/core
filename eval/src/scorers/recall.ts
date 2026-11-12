import { matchConcepts } from "./matching.js";
import type { EvalCase, Score, TargetOutput } from "../types.js";

export function conceptRecall(out: TargetOutput, c: EvalCase): Score {
  if (!out.graph) return { name: "conceptRecall", value: 0, pass: false, gate: true, details: { missing: c.expect.concepts.map((x) => x.name) } };
  const matched = matchConcepts(out.graph, c.expect.concepts);
  const missing = c.expect.concepts.filter((ec) => !matched.get(ec.name)).map((ec) => ec.name);
  const value = 1 - missing.length / c.expect.concepts.length;
  return { name: "conceptRecall", value, pass: value >= 0.8, gate: true, details: { missing } };
}

/**
 * An expected edge counts as found only if both endpoints were matched AND the
 * graph has that edge in that direction with that relation. Reversed (right
 * relation, wrong direction) and wrong-relation edges are counted separately,
 * to tell "doesn't know it" from "has the convention backwards".
 */
export function edgeRecall(out: TargetOutput, c: EvalCase): Score {
  const total = c.expect.edges.length;
  if (!out.graph) return { name: "edgeRecall", value: 0, pass: false, gate: false, details: { found: 0, reversed: 0, wrongRelation: 0, missing: total } };
  const graph = out.graph;
  const matched = matchConcepts(graph, c.expect.concepts);
  let found = 0, reversed = 0, wrongRelation = 0;
  for (const e of c.expect.edges) {
    const from = matched.get(e.from), to = matched.get(e.to);
    if (!from || !to) continue;
    const between = (a: string, b: string) => graph.edges.filter((x) => x.from === a && x.to === b);
    const fwd = between(from.id, to.id);
    if (fwd.some((x) => x.relation === e.relation)) found++;
    else if (fwd.length) wrongRelation++;
    else if (between(to.id, from.id).length) reversed++;
  }
  const value = found / total;
  return { name: "edgeRecall", value, pass: value >= 0.67, gate: false, details: { found, reversed, wrongRelation, missing: total - found - reversed - wrongRelation } };
}
