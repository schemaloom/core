import type { ConceptGraph } from "../../../src/schemas/conceptGraphSchema.js";

type Node = ConceptGraph["nodes"][number];
export interface ExpectedConcept { name: string; aliases: string[] }

/** Strip a plural "s", but leave words where it is part of the stem (calculus, analysis, class). */
function singular(w: string): string {
  return w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w;
}

/** Lowercase, drop punctuation, naive singularisation. Applied to both sides, so it only has to be consistent. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/['‘’]/g, "") // "Newton's" -> "newtons", not "newton s"
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

/** True if `needle` appears as a contiguous run of whole words inside `hay`. */
function containsWords(hay: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) return true;
  }
  return false;
}

type Strength = "exact" | "loose" | null;

function strength(label: string, concept: ExpectedConcept): Strength {
  const l = normalize(label);
  const targets = [concept.name, ...concept.aliases].map(normalize).filter(Boolean);
  if (targets.some((t) => t === l)) return "exact";
  const lw = l.split(" ");
  for (const t of targets) {
    const tw = t.split(" ");
    // label contains the concept ("differential calculus" for "calculus")
    if (containsWords(lw, tw)) return "loose";
    // concept contains the label, but only for multi-word labels, so a bare
    // "network" can't satisfy "neural network"
    if (lw.length >= 2 && containsWords(tw, lw)) return "loose";
  }
  return null;
}

/**
 * Assign graph nodes to expected concepts. Each node satisfies at most one
 * concept, and exact matches are claimed before loose ones. Without this, a
 * lone "cell membrane" node would also count as the concept "cell".
 */
export function matchConcepts(graph: ConceptGraph, concepts: ExpectedConcept[]): Map<string, Node | undefined> {
  const out = new Map<string, Node | undefined>(concepts.map((c) => [c.name, undefined]));
  const claimed = new Set<string>();
  for (const want of ["exact", "loose"] as const) {
    for (const c of concepts) {
      if (out.get(c.name)) continue;
      const node = graph.nodes.find((n) => !claimed.has(n.id) && strength(n.label, c) === want);
      if (node) {
        out.set(c.name, node);
        claimed.add(node.id);
      }
    }
  }
  return out;
}

/** Single-concept convenience wrapper (no claim competition). */
export function findNode(graph: ConceptGraph, concept: ExpectedConcept): Node | undefined {
  return matchConcepts(graph, [concept]).get(concept.name);
}
