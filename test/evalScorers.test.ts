import { test } from "node:test";
import assert from "node:assert/strict";
import { findNode, matchConcepts, normalize } from "../eval/src/scorers/matching.js";
import { conceptRecall, edgeRecall } from "../eval/src/scorers/recall.js";
import { extracted, grounding, sizeInRange, structure } from "../eval/src/scorers/structure.js";
import { scoreTrial, trialPasses } from "../eval/src/scorers/index.js";
import { loadCases, selectCases } from "../eval/src/dataset.js";
import { percentile, summarize } from "../eval/src/report.js";
import { rescore, runTrial, withTimeout } from "../eval/src/runner.js";
import type { ConceptGraph } from "../src/schemas/conceptGraphSchema.js";
import type { EvalCase, RunConfig, TargetOutput } from "../eval/src/types.js";

const text = "Calculus has differential calculus and integral calculus. A limit underlies both; the fundamental theorem of calculus links them.";
const node = (id: string, label: string, quote = label) => ({ id, label, description: "d", sourceQuote: quote });
const edge = (from: string, to: string, relation: "prerequisite_of" | "part_of" = "part_of") => ({ from, to, relation });
const out = (graph: ConceptGraph | null, extra: Partial<TargetOutput> = {}): TargetOutput => ({ graph, latencyMs: 10, attempts: 1, ...extra });

const c: EvalCase = {
  id: "t", split: "dev", tags: ["x"], articlePath: "t.txt", text,
  expect: {
    concepts: [
      { name: "calculus", aliases: [] },
      { name: "differential calculus", aliases: ["differentiation"] },
      { name: "integral calculus", aliases: [] },
      { name: "limit", aliases: ["limits"] },
      { name: "fundamental theorem of calculus", aliases: [] },
    ],
    edges: [
      { from: "differential calculus", to: "calculus", relation: "part_of" },
      { from: "limit", to: "calculus", relation: "prerequisite_of" },
    ],
    nodeCountRange: [4, 10],
  },
};

const good: ConceptGraph = {
  nodes: [
    node("calculus", "Calculus"), node("diff", "Differential Calculus", "differential calculus"),
    node("int", "Integral calculus", "integral calculus"), node("limit", "Limits", "A limit"),
    node("ftc", "Fundamental Theorem of Calculus", "fundamental theorem of calculus"),
  ],
  edges: [edge("diff", "calculus"), edge("int", "calculus"), edge("limit", "calculus", "prerequisite_of")],
};

// ------------------------------------------------------------ normalize

test("normalize: case, punctuation, curly quotes, plurals", () => {
  assert.equal(normalize("  Neural-Networks! "), "neural network");
  assert.equal(normalize("Newton’s Laws"), "newton law");
  assert.equal(normalize("TCP/IP"), "tcp ip");
});

test("normalize: leaves stems that merely end in s", () => {
  assert.equal(normalize("calculus"), "calculus");
  assert.equal(normalize("analysis"), "analysis");
  assert.equal(normalize("class"), "class");
  assert.equal(normalize("vs"), "vs");
});

// ------------------------------------------------------------ matching

test("findNode: exact, plural and alias", () => {
  const g: ConceptGraph = { nodes: [node("a", "Derivatives"), node("b", "Differentiation")], edges: [] };
  assert.equal(findNode(g, { name: "derivative", aliases: [] })?.id, "a");
  assert.equal(findNode(g, { name: "derivative", aliases: ["differentiation"] })?.id, "a"); // first match wins
  assert.equal(findNode({ nodes: [node("b", "Differentiation")], edges: [] }, { name: "derivative", aliases: ["differentiation"] })?.id, "b");
});

test("findNode: label containing the concept matches, on word boundaries only", () => {
  const concept = { name: "calculus", aliases: [] };
  assert.equal(findNode({ nodes: [node("a", "Differential Calculus")], edges: [] }, concept)?.id, "a");
  assert.equal(findNode({ nodes: [node("a", "Precalculus")], edges: [] }, concept), undefined);
});

test("findNode: a bare generic label does not satisfy a longer concept", () => {
  assert.equal(findNode({ nodes: [node("a", "Network")], edges: [] }, { name: "neural network", aliases: [] }), undefined);
  // but a multi-word label inside a longer concept does
  assert.equal(findNode({ nodes: [node("a", "Neural Network")], edges: [] }, { name: "artificial neural network", aliases: [] })?.id, "a");
});

test("matchConcepts: one node cannot satisfy two concepts; exact beats loose", () => {
  const g: ConceptGraph = { nodes: [node("m", "Cell membrane")], edges: [] };
  const m = matchConcepts(g, [{ name: "cell", aliases: [] }, { name: "cell membrane", aliases: [] }]);
  assert.equal(m.get("cell membrane")?.id, "m");
  assert.equal(m.get("cell"), undefined); // would be a false positive if nodes could be reused
  const g2: ConceptGraph = { nodes: [node("m", "Cell membrane"), node("c", "Cell")], edges: [] };
  const m2 = matchConcepts(g2, [{ name: "cell", aliases: [] }, { name: "cell membrane", aliases: [] }]);
  assert.equal(m2.get("cell")?.id, "c");
});

test("matching: short acronym aliases only match whole words", () => {
  const concept = { name: "Internet Protocol", aliases: ["IP"] };
  assert.equal(findNode({ nodes: [node("a", "Description")], edges: [] }, concept), undefined);
  assert.equal(findNode({ nodes: [node("a", "IP")], edges: [] }, concept)?.id, "a");
});

// ------------------------------------------------------------ recall scorers

test("conceptRecall: all found passes", () => {
  const s = conceptRecall(out(good), c);
  assert.equal(s.value, 1);
  assert.equal(s.pass, true);
  assert.equal(s.gate, true);
});

test("conceptRecall: 4/5 is exactly at the threshold, 3/5 fails", () => {
  const drop = (...ids: string[]): ConceptGraph => ({ nodes: good.nodes.filter((n) => !ids.includes(n.id)), edges: [] });
  const four = conceptRecall(out(drop("ftc")), c);
  assert.equal(four.value, 0.8);
  assert.equal(four.pass, true);
  assert.deepEqual(four.details?.missing, ["fundamental theorem of calculus"]);
  assert.equal(conceptRecall(out(drop("ftc", "limit")), c).pass, false);
});

test("conceptRecall: null graph scores 0", () => {
  const s = conceptRecall(out(null), c);
  assert.equal(s.value, 0);
  assert.equal(s.pass, false);
});

test("edgeRecall: found, reversed, wrong relation, missing endpoint", () => {
  assert.equal(edgeRecall(out(good), c).value, 1);

  const reversed: ConceptGraph = { ...good, edges: [edge("calculus", "diff"), edge("limit", "calculus", "prerequisite_of")] };
  const r = edgeRecall(out(reversed), c);
  assert.equal(r.value, 0.5);
  assert.equal(r.details?.reversed, 1);

  const wrongRel: ConceptGraph = { ...good, edges: [edge("diff", "calculus", "prerequisite_of"), edge("limit", "calculus", "prerequisite_of")] };
  const w = edgeRecall(out(wrongRel), c);
  assert.equal(w.details?.wrongRelation, 1);
  assert.equal(w.details?.found, 1);

  const noLimit: ConceptGraph = { nodes: good.nodes.filter((n) => n.id !== "limit"), edges: [edge("diff", "calculus")] };
  const m = edgeRecall(out(noLimit), c);
  assert.equal(m.value, 0.5);
  assert.equal(m.details?.missing, 1);
});

test("edgeRecall is not a gate", () => {
  assert.equal(edgeRecall(out(good), c).gate, false);
});

// ------------------------------------------------------------ structure scorers

test("extracted: null and malformed graphs fail", () => {
  assert.equal(extracted(out(good)).pass, true);
  assert.equal(extracted(out(null)).pass, false);
  assert.equal(extracted(out({ nodes: "x" } as unknown as ConceptGraph)).pass, false);
});

test("structure: a cycle fails it, listing the issue type", () => {
  const cyc: ConceptGraph = { ...good, edges: [edge("diff", "int", "prerequisite_of"), edge("int", "diff", "prerequisite_of")] };
  const s = structure(out(cyc), c);
  assert.equal(s.pass, false);
  assert.deepEqual(s.details?.issueTypes, ["cycle"]);
});

test("structure ignores ungrounded nodes; grounding scores them separately", () => {
  const bad: ConceptGraph = { ...good, nodes: good.nodes.map((n) => ({ ...n, sourceQuote: "not in the text at all" })) };
  assert.equal(structure(out(bad), c).pass, true);
  const g = grounding(out(bad), c);
  assert.equal(g.value, 0);
  assert.equal(g.pass, false);
  assert.equal(grounding(out(good), c).pass, true);
});

test("sizeInRange", () => {
  assert.equal(sizeInRange(out(good), c).pass, true);
  assert.equal(sizeInRange(out({ nodes: [], edges: [] }), c).pass, false);
  assert.equal(sizeInRange(out(null), c).pass, false);
});

test("scoreTrial: a trial passes only if every gate passes; non-gates don't count", () => {
  const scores = scoreTrial(out(good), c);
  assert.equal(trialPasses(scores), true);
  // break only a non-gate metric (edges reversed) -> still passes
  const rev: ConceptGraph = { ...good, edges: [edge("calculus", "diff")] };
  assert.equal(trialPasses(scoreTrial(out(rev), c)), true);
  assert.equal(trialPasses(scoreTrial(out(null), c)), false);
});

// ------------------------------------------------------------ runner / report

const cfg: RunConfig = { model: "m", temperature: 0, retries: 0, repeats: 2, concurrency: 2, timeoutMs: 50, split: "dev", target: "library", useCache: false, caseIds: [] };

test("runTrial: a throwing target becomes a failed result, not a crash", async () => {
  const r = await runTrial(c, 0, cfg, async () => { throw new Error("boom"); });
  assert.equal(r.pass, false);
  assert.equal(r.output.error, "boom");
  assert.equal(r.output.attempts, 0);
});

test("runTrial: timeout becomes a failed result", async () => {
  const r = await runTrial(c, 0, cfg, () => new Promise(() => {}));
  assert.equal(r.pass, false);
  assert.match(r.output.error!, /timeout/);
});

test("withTimeout passes through fast results", async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
});

test("summarize: pass rate, consistency, failures by type", async () => {
  const ok = await runTrial(c, 0, cfg, async () => out(good));
  const ok2 = await runTrial(c, 1, cfg, async () => out(good));
  const bad = await runTrial({ ...c, id: "u" }, 0, cfg, async () => out(null, { error: "timeout after 5ms" }));
  const good2 = await runTrial({ ...c, id: "u" }, 1, cfg, async () => out(good));
  const s = summarize([ok, ok2, bad, good2], [c, { ...c, id: "u" }]);
  assert.equal(s.trials, 4);
  assert.equal(s.passRate, 0.75);
  assert.equal(s.consistentCases, 1);
  assert.equal(s.failuresByScorer.extracted, 1);
  assert.equal(s.failuresByIssue.timeout, 1);
  assert.equal(s.byCase.u.passRate, 0.5);
  assert.equal(s.byTag.x.trials, 4);
});

test("percentile (nearest rank)", () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([], 50), 0);
});

test("rescore: re-applies current scorers to stored outputs and skips unknown cases", async () => {
  const t = await runTrial(c, 0, cfg, async () => out(good));
  const stale = { ...t, pass: false, scores: [] };
  const { trials, skipped } = rescore([stale, { ...stale, caseId: "gone" }], [c]);
  assert.equal(trials.length, 1);
  assert.equal(trials[0].pass, true);
  assert.deepEqual(skipped, ["gone"]);
});

// ------------------------------------------------------------ dataset

test("every committed case file loads, validates, and splits as designed", () => {
  const cases = loadCases();
  assert.ok(cases.length >= 15 && cases.length <= 20, `expected 15-20 cases, got ${cases.length}`);
  assert.ok(selectCases(cases, "dev").length >= 10);
  assert.ok(selectCases(cases, "test").length >= 5);
  for (const k of cases) assert.ok(k.expect.concepts.length >= 3, k.id);
});
