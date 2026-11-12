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
  expect(normalize("  Neural-Networks! ")).toBe("neural network");
  expect(normalize("Newton’s Laws")).toBe("newton law");
  expect(normalize("TCP/IP")).toBe("tcp ip");
});

test("normalize: leaves stems that merely end in s", () => {
  expect(normalize("calculus")).toBe("calculus");
  expect(normalize("analysis")).toBe("analysis");
  expect(normalize("class")).toBe("class");
  expect(normalize("vs")).toBe("vs");
});

// ------------------------------------------------------------ matching

test("findNode: exact, plural and alias", () => {
  const g: ConceptGraph = { nodes: [node("a", "Derivatives"), node("b", "Differentiation")], edges: [] };
  expect(findNode(g, { name: "derivative", aliases: [] })?.id).toBe("a");
  expect(findNode(g, { name: "derivative", aliases: ["differentiation"] })?.id).toBe("a"); // first match wins
  expect(findNode({ nodes: [node("b", "Differentiation")], edges: [] }, { name: "derivative", aliases: ["differentiation"] })?.id).toBe("b");
});

test("findNode: label containing the concept matches, on word boundaries only", () => {
  const concept = { name: "calculus", aliases: [] };
  expect(findNode({ nodes: [node("a", "Differential Calculus")], edges: [] }, concept)?.id).toBe("a");
  expect(findNode({ nodes: [node("a", "Precalculus")], edges: [] }, concept)).toBe(undefined);
});

test("findNode: a bare generic label does not satisfy a longer concept", () => {
  expect(findNode({ nodes: [node("a", "Network")], edges: [] }, { name: "neural network", aliases: [] })).toBe(undefined);
  // but a multi-word label inside a longer concept does
  expect(findNode({ nodes: [node("a", "Neural Network")], edges: [] }, { name: "artificial neural network", aliases: [] })?.id).toBe("a");
});

test("matchConcepts: one node cannot satisfy two concepts; exact beats loose", () => {
  const g: ConceptGraph = { nodes: [node("m", "Cell membrane")], edges: [] };
  const m = matchConcepts(g, [{ name: "cell", aliases: [] }, { name: "cell membrane", aliases: [] }]);
  expect(m.get("cell membrane")?.id).toBe("m");
  expect(m.get("cell")).toBe(undefined); // would be a false positive if nodes could be reused
  const g2: ConceptGraph = { nodes: [node("m", "Cell membrane"), node("c", "Cell")], edges: [] };
  const m2 = matchConcepts(g2, [{ name: "cell", aliases: [] }, { name: "cell membrane", aliases: [] }]);
  expect(m2.get("cell")?.id).toBe("c");
});

test("matching: short acronym aliases only match whole words", () => {
  const concept = { name: "Internet Protocol", aliases: ["IP"] };
  expect(findNode({ nodes: [node("a", "Description")], edges: [] }, concept)).toBe(undefined);
  expect(findNode({ nodes: [node("a", "IP")], edges: [] }, concept)?.id).toBe("a");
});

// ------------------------------------------------------------ recall scorers

test("conceptRecall: all found passes", () => {
  const s = conceptRecall(out(good), c);
  expect(s.value).toBe(1);
  expect(s.pass).toBe(true);
  expect(s.gate).toBe(true);
});

test("conceptRecall: 4/5 is exactly at the threshold, 3/5 fails", () => {
  const drop = (...ids: string[]): ConceptGraph => ({ nodes: good.nodes.filter((n) => !ids.includes(n.id)), edges: [] });
  const four = conceptRecall(out(drop("ftc")), c);
  expect(four.value).toBe(0.8);
  expect(four.pass).toBe(true);
  expect(four.details?.missing).toEqual(["fundamental theorem of calculus"]);
  expect(conceptRecall(out(drop("ftc", "limit")), c).pass).toBe(false);
});

test("conceptRecall: null graph scores 0", () => {
  const s = conceptRecall(out(null), c);
  expect(s.value).toBe(0);
  expect(s.pass).toBe(false);
});

test("edgeRecall: found, reversed, wrong relation, missing endpoint", () => {
  expect(edgeRecall(out(good), c).value).toBe(1);

  const reversed: ConceptGraph = { ...good, edges: [edge("calculus", "diff"), edge("limit", "calculus", "prerequisite_of")] };
  const r = edgeRecall(out(reversed), c);
  expect(r.value).toBe(0.5);
  expect(r.details?.reversed).toBe(1);

  const wrongRel: ConceptGraph = { ...good, edges: [edge("diff", "calculus", "prerequisite_of"), edge("limit", "calculus", "prerequisite_of")] };
  const w = edgeRecall(out(wrongRel), c);
  expect(w.details?.wrongRelation).toBe(1);
  expect(w.details?.found).toBe(1);

  const noLimit: ConceptGraph = { nodes: good.nodes.filter((n) => n.id !== "limit"), edges: [edge("diff", "calculus")] };
  const m = edgeRecall(out(noLimit), c);
  expect(m.value).toBe(0.5);
  expect(m.details?.missing).toBe(1);
});

test("edgeRecall is not a gate", () => {
  expect(edgeRecall(out(good), c).gate).toBe(false);
});

// ------------------------------------------------------------ structure scorers

test("extracted: null and malformed graphs fail", () => {
  expect(extracted(out(good)).pass).toBe(true);
  expect(extracted(out(null)).pass).toBe(false);
  expect(extracted(out({ nodes: "x" } as unknown as ConceptGraph)).pass).toBe(false);
});

test("structure: a cycle fails it, listing the issue type", () => {
  const cyc: ConceptGraph = { ...good, edges: [edge("diff", "int", "prerequisite_of"), edge("int", "diff", "prerequisite_of")] };
  const s = structure(out(cyc), c);
  expect(s.pass).toBe(false);
  expect(s.details?.issueTypes).toEqual(["cycle"]);
});

test("structure ignores ungrounded nodes; grounding scores them separately", () => {
  const bad: ConceptGraph = { ...good, nodes: good.nodes.map((n) => ({ ...n, sourceQuote: "not in the text at all" })) };
  expect(structure(out(bad), c).pass).toBe(true);
  const g = grounding(out(bad), c);
  expect(g.value).toBe(0);
  expect(g.pass).toBe(false);
  expect(grounding(out(good), c).pass).toBe(true);
});

test("sizeInRange", () => {
  expect(sizeInRange(out(good), c).pass).toBe(true);
  expect(sizeInRange(out({ nodes: [], edges: [] }), c).pass).toBe(false);
  expect(sizeInRange(out(null), c).pass).toBe(false);
});

test("scoreTrial: a trial passes only if every gate passes; non-gates don't count", () => {
  const scores = scoreTrial(out(good), c);
  expect(trialPasses(scores)).toBe(true);
  // break only a non-gate metric (edges reversed) -> still passes
  const rev: ConceptGraph = { ...good, edges: [edge("calculus", "diff")] };
  expect(trialPasses(scoreTrial(out(rev), c))).toBe(true);
  expect(trialPasses(scoreTrial(out(null), c))).toBe(false);
});

// ------------------------------------------------------------ runner / report

const cfg: RunConfig = { model: "m", temperature: 0, retries: 0, repeats: 2, concurrency: 2, timeoutMs: 50, split: "dev", target: "library", useCache: false, caseIds: [] };

test("runTrial: a throwing target becomes a failed result, not a crash", async () => {
  const r = await runTrial(c, 0, cfg, async () => { throw new Error("boom"); });
  expect(r.pass).toBe(false);
  expect(r.output.error).toBe("boom");
  expect(r.output.attempts).toBe(0);
});

test("runTrial: timeout becomes a failed result", async () => {
  const r = await runTrial(c, 0, cfg, () => new Promise(() => {}));
  expect(r.pass).toBe(false);
  expect(r.output.error!).toMatch(/timeout/);
});

test("withTimeout passes through fast results", async () => {
  expect(await withTimeout(Promise.resolve(7), 50)).toBe(7);
});

test("summarize: pass rate, consistency, failures by type", async () => {
  const ok = await runTrial(c, 0, cfg, async () => out(good));
  const ok2 = await runTrial(c, 1, cfg, async () => out(good));
  const bad = await runTrial({ ...c, id: "u" }, 0, cfg, async () => out(null, { error: "timeout after 5ms" }));
  const good2 = await runTrial({ ...c, id: "u" }, 1, cfg, async () => out(good));
  const s = summarize([ok, ok2, bad, good2], [c, { ...c, id: "u" }]);
  expect(s.trials).toBe(4);
  expect(s.passRate).toBe(0.75);
  expect(s.consistentCases).toBe(1);
  expect(s.failuresByScorer.extracted).toBe(1);
  expect(s.failuresByIssue.timeout).toBe(1);
  expect(s.byCase.u.passRate).toBe(0.5);
  expect(s.byTag.x.trials).toBe(4);
});

test("percentile (nearest rank)", () => {
  expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
  expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  expect(percentile([], 50)).toBe(0);
});

test("rescore: re-applies current scorers to stored outputs and skips unknown cases", async () => {
  const t = await runTrial(c, 0, cfg, async () => out(good));
  const stale = { ...t, pass: false, scores: [] };
  const { trials, skipped } = rescore([stale, { ...stale, caseId: "gone" }], [c]);
  expect(trials.length).toBe(1);
  expect(trials[0].pass).toBe(true);
  expect(skipped).toEqual(["gone"]);
});

// ------------------------------------------------------------ dataset

test("every committed case file loads, validates, and splits as designed", () => {
  const cases = loadCases();
  expect(cases.length >= 15 && cases.length <= 20).toBeTruthy();
  expect(selectCases(cases, "dev").length >= 10).toBeTruthy();
  expect(selectCases(cases, "test").length >= 5).toBeTruthy();
  for (const k of cases) expect(k.expect.concepts.length >= 3).toBeTruthy();
});
