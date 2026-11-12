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
  expect(r.valid).toBe(true);
  expect(r.issues).toEqual([]);
  expect(r.stats.groundedRatio).toBe(1);
});

test("empty graph", () => {
  const r = checkGraph({ nodes: [], edges: [] }, text);
  expect(r.valid).toBe(false);
  expect(types({ nodes: [], edges: [] })).toEqual(["empty_graph"]);
});

test("duplicate id", () => {
  const r = checkGraph({ nodes: [node("limit", "a limit"), node("limit", "a limit")], edges: [] }, text);
  expect(r.valid).toBe(false);
  expect(r.issues.some((i) => i.type === "duplicate_id" && i.ids[0] === "limit")).toBeTruthy();
});

test("dangling edge", () => {
  const r = checkGraph({ nodes: [node("limit", "a limit")], edges: [edge("limit", "ghost")] }, text);
  const i = r.issues.find((x) => x.type === "dangling_edge")!;
  expect(i.severity).toBe("error");
  expect(i.ids).toEqual(["ghost"]);
});

test("self loop", () => {
  const g = { nodes: [node("limit", "a limit")], edges: [edge("limit", "limit")] };
  expect(types(g).includes("self_loop")).toBeTruthy();
  expect(!types(g).includes("cycle")).toBeTruthy();
});

test("3-node cycle names the exact path", () => {
  const g: ConceptGraph = {
    nodes: [node("a", "limit"), node("b", "derivative"), node("c", "integral")],
    edges: [edge("a", "b"), edge("b", "c"), edge("c", "a")],
  };
  const r = checkGraph(g, text);
  expect(r.valid).toBe(false);
  const c = r.issues.filter((i) => i.type === "cycle");
  expect(c.length).toBe(1);
  expect(c[0].message).toMatch(/a → b → c → a/);
});

test("duplicate edge is a warning only", () => {
  const g = { ...valid, edges: [...valid.edges, edge("limit", "derivative")] };
  const r = checkGraph(g, text);
  expect(r.valid).toBe(true);
  expect(r.issues.map((i) => i.type)).toEqual(["duplicate_edge"]);
});

test("ungrounded quote: warning above threshold, error below", () => {
  const four = [node("a", "limit"), node("b", "derivative"), node("c", "integral"), node("d", "calculus")];
  const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d")];
  const one = checkGraph({ nodes: [...four.slice(0, 3), node("d", "made up")], edges }, text);
  expect(one.stats.groundedRatio).toBe(0.75);
  expect(one.valid).toBe(false); // 0.75 < 0.8
  const lenient = checkGraph({ nodes: [...four.slice(0, 3), node("d", "made up")], edges }, text, { minGroundedRatio: 0.5 });
  expect(lenient.valid).toBe(true);
  expect(lenient.issues[0].severity).toBe("warning");
});

test("grounding normalizes case, whitespace, curly quotes and dashes", () => {
  const src = "The  Fundamental\nTheorem — it’s key";
  const g = { nodes: [node("t", "fundamental theorem - it's KEY")], edges: [] };
  expect(checkGraph(g, src).stats.groundedRatio).toBe(1);
});

test("quotes under 3 chars are ungrounded", () => {
  expect(checkGraph({ nodes: [node("x", "ca")], edges: [] }, text).stats.groundedRatio).toBe(0);
});

test("isolated node warns", () => {
  const g = { ...valid, nodes: [...valid.nodes, node("limit2", "a limit")] };
  expect(types(g).includes("isolated_node")).toBeTruthy();
});

test("two acyclic graphs whose merge forms a cycle", () => {
  const g1: ConceptGraph = { nodes: [node("a", "limit"), node("b", "derivative")], edges: [edge("a", "b")] };
  const g2: ConceptGraph = { nodes: [node("b", "derivative"), node("a", "limit")], edges: [edge("b", "a"), edge("a", "b")] };
  const g3: ConceptGraph = { nodes: [node("b", "derivative"), node("a", "limit")], edges: [edge("b", "a")] };
  expect(checkGraph(g1, text).valid).toBe(true);
  expect(checkGraph(g3, text).valid).toBe(true);
  const merged = mergeGraphs([g1, g3]);
  expect(merged.nodes.length).toBe(2);
  const r = checkGraph(merged, text);
  expect(r.valid).toBe(false);
  expect(r.issues.some((i) => i.type === "cycle")).toBeTruthy();
  expect(mergeGraphs([g1, g2]).edges.length).toBe(2); // deduped
});
