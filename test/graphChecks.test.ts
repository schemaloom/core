import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGraph } from "../src/validation/graphChecks.js";
import { mergeGraphs } from "../src/validation/mergeGraphs.js";
import type { ConceptGraph } from "../src/schemas/conceptGraphSchema.js";

const text =
  "Calculus studies change. A limit describes approach to a value; the derivative is defined using a limit, and the integral reverses the derivative.";

const node = (id: string, quote = id) => ({ id, label: id, description: `About ${id}.`, sourceQuote: quote });
const edge = (from: string, to: string, relation: "prerequisite_of" | "part_of" = "prerequisite_of") => ({ from, to, relation });
const types = (g: ConceptGraph, t = text) => checkGraph(g, t).issues.map((i) => i.type);

const valid: ConceptGraph = {
  nodes: [node("calculus", "Calculus"), node("limit", "a limit"), node("derivative", "the derivative"), node("integral", "the integral")],
  edges: [edge("limit", "derivative"), edge("derivative", "integral"), edge("derivative", "calculus", "part_of")],
};

test("valid 4-node graph", () => {
  const r = checkGraph(valid, text);
  assert.equal(r.valid, true);
  assert.deepEqual(r.issues, []);
  assert.equal(r.stats.groundedRatio, 1);
});

test("empty graph", () => {
  const r = checkGraph({ nodes: [], edges: [] }, text);
  assert.equal(r.valid, false);
  assert.deepEqual(types({ nodes: [], edges: [] }), ["empty_graph"]);
});

test("duplicate id", () => {
  const r = checkGraph({ nodes: [node("limit", "a limit"), node("limit", "a limit")], edges: [] }, text);
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.type === "duplicate_id" && i.ids[0] === "limit"));
});

test("dangling edge", () => {
  const r = checkGraph({ nodes: [node("limit", "a limit")], edges: [edge("limit", "ghost")] }, text);
  const i = r.issues.find((x) => x.type === "dangling_edge")!;
  assert.equal(i.severity, "error");
  assert.deepEqual(i.ids, ["ghost"]);
});

test("self loop", () => {
  const g = { nodes: [node("limit", "a limit")], edges: [edge("limit", "limit")] };
  assert.ok(types(g).includes("self_loop"));
  assert.ok(!types(g).includes("cycle"));
});

test("3-node cycle names the exact path", () => {
  const g: ConceptGraph = {
    nodes: [node("a", "limit"), node("b", "derivative"), node("c", "integral")],
    edges: [edge("a", "b"), edge("b", "c"), edge("c", "a")],
  };
  const r = checkGraph(g, text);
  assert.equal(r.valid, false);
  const c = r.issues.filter((i) => i.type === "cycle");
  assert.equal(c.length, 1);
  assert.match(c[0].message, /a → b → c → a/);
});

test("duplicate edge is a warning only", () => {
  const g = { ...valid, edges: [...valid.edges, edge("limit", "derivative")] };
  const r = checkGraph(g, text);
  assert.equal(r.valid, true);
  assert.deepEqual(r.issues.map((i) => i.type), ["duplicate_edge"]);
});

test("ungrounded quote: warning above threshold, error below", () => {
  const four = [node("a", "limit"), node("b", "derivative"), node("c", "integral"), node("d", "calculus")];
  const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d")];
  const one = checkGraph({ nodes: [...four.slice(0, 3), node("d", "made up")], edges }, text);
  assert.equal(one.stats.groundedRatio, 0.75);
  assert.equal(one.valid, false); // 0.75 < 0.8
  const lenient = checkGraph({ nodes: [...four.slice(0, 3), node("d", "made up")], edges }, text, { minGroundedRatio: 0.5 });
  assert.equal(lenient.valid, true);
  assert.equal(lenient.issues[0].severity, "warning");
});

test("grounding normalizes case, whitespace, curly quotes and dashes", () => {
  const src = "The  Fundamental\nTheorem — it’s key";
  const g = { nodes: [node("t", "fundamental theorem - it's KEY")], edges: [] };
  assert.equal(checkGraph(g, src).stats.groundedRatio, 1);
});

test("quotes under 3 chars are ungrounded", () => {
  assert.equal(checkGraph({ nodes: [node("x", "ca")], edges: [] }, text).stats.groundedRatio, 0);
});

test("isolated node warns", () => {
  const g = { ...valid, nodes: [...valid.nodes, node("limit2", "a limit")] };
  assert.ok(types(g).includes("isolated_node"));
});

test("two acyclic graphs whose merge forms a cycle", () => {
  const g1: ConceptGraph = { nodes: [node("a", "limit"), node("b", "derivative")], edges: [edge("a", "b")] };
  const g2: ConceptGraph = { nodes: [node("b", "derivative"), node("a", "limit")], edges: [edge("b", "a"), edge("a", "b")] };
  const g3: ConceptGraph = { nodes: [node("b", "derivative"), node("a", "limit")], edges: [edge("b", "a")] };
  assert.equal(checkGraph(g1, text).valid, true);
  assert.equal(checkGraph(g3, text).valid, true);
  const merged = mergeGraphs([g1, g3]);
  assert.equal(merged.nodes.length, 2);
  const r = checkGraph(merged, text);
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.type === "cycle"));
  assert.equal(mergeGraphs([g1, g2]).edges.length, 2); // deduped
});
