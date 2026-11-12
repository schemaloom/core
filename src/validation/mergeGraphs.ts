import type { ConceptGraph } from "../schemas/conceptGraphSchema.js";
import { dedupeEdges } from "./graphChecks.js";

/**
 * Combine graphs extracted from separate chunks.
 * Nodes are unioned by id (first wins); edges are unioned and deduplicated.
 *
 * The result must be re-checked with checkGraph: two chunks can each be
 * acyclic while their combined edges form a cycle.
 */
export function mergeGraphs(graphs: ConceptGraph[]): ConceptGraph {
  const nodes = new Map<string, ConceptGraph["nodes"][number]>();
  for (const g of graphs) {
    for (const n of g.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
  }
  return {
    nodes: [...nodes.values()],
    edges: dedupeEdges(graphs.flatMap((g) => g.edges)),
  };
}
