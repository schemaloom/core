import type { ConceptEdge, ConceptGraph } from "../schemas/conceptGraphSchema.js";

export type IssueType =
  | "empty_graph"
  | "duplicate_id"
  | "dangling_edge"
  | "self_loop"
  | "duplicate_edge"
  | "cycle"
  | "ungrounded_node"
  | "isolated_node";

export interface GraphIssue {
  type: IssueType;
  severity: "error" | "warning";
  /** Written so it can be sent straight back to the model in a retry prompt. */
  message: string;
  ids: string[];
}

export interface GraphCheckResult {
  /** true if there are no error-severity issues */
  valid: boolean;
  issues: GraphIssue[];
  stats: { nodes: number; edges: number; groundedRatio: number };
}

export interface GraphCheckOptions {
  minGroundedRatio: number;
}

const MIN_QUOTE_LENGTH = 3;

/** Lowercase, unify curly quotes/dashes, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function edgeKey(e: ConceptEdge): string {
  return JSON.stringify([e.from, e.to, e.relation]);
}

/** Remove edges repeating the same (from, to, relation), keeping the first. */
export function dedupeEdges(edges: ConceptEdge[]): ConceptEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const k = edgeKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Find cycles with a three-colour DFS. Reaching an in-progress node means we
 * found a back edge; walking the parent pointers yields the exact cycle.
 * Returns one cycle per back edge, each as [a, b, c, a].
 */
export function findCycles(nodeIds: string[], edges: ConceptEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(nodeIds.map((id) => [id, WHITE]));
  const parent = new Map<string, string>();
  const cycles: string[][] = [];

  // Iterative DFS so very deep graphs can't overflow the call stack.
  for (const root of nodeIds) {
    if (color.get(root) !== WHITE) continue;
    color.set(root, GRAY);
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const neighbors = adj.get(frame.id)!;
      if (frame.next === neighbors.length) {
        color.set(frame.id, BLACK);
        stack.pop();
        continue;
      }
      const v = neighbors[frame.next++];
      const c = color.get(v);
      if (c === WHITE) {
        parent.set(v, frame.id);
        color.set(v, GRAY);
        stack.push({ id: v, next: 0 });
      } else if (c === GRAY) {
        // back edge frame.id -> v: walk parents from frame.id up to v
        const path = [frame.id];
        let cur = frame.id;
        while (cur !== v) {
          cur = parent.get(cur)!;
          path.push(cur);
        }
        path.reverse(); // v ... frame.id
        path.push(v);
        cycles.push(path);
      }
    }
  }
  return cycles;
}

export function checkGraph(
  graph: ConceptGraph,
  sourceText: string,
  opts: GraphCheckOptions = { minGroundedRatio: 0.8 }
): GraphCheckResult {
  const issues: GraphIssue[] = [];
  const { nodes, edges } = graph;

  const finish = (groundedRatio: number): GraphCheckResult => ({
    valid: !issues.some((i) => i.severity === "error"),
    issues,
    stats: { nodes: nodes.length, edges: edges.length, groundedRatio },
  });

  // 1. Empty graph
  if (nodes.length === 0) {
    issues.push({
      type: "empty_graph",
      severity: "error",
      message:
        "The graph has no nodes. Extract the key concepts that the text actually discusses.",
      ids: [],
    });
    return finish(0);
  }

  // 2. Duplicate ids
  const idCounts = new Map<string, number>();
  for (const n of nodes) idCounts.set(n.id, (idCounts.get(n.id) ?? 0) + 1);
  for (const [id, count] of idCounts) {
    if (count > 1) {
      issues.push({
        type: "duplicate_id",
        severity: "error",
        message: `Node id "${id}" is used by ${count} nodes. Every node id must be unique.`,
        ids: [id],
      });
    }
  }
  const nodeIds = [...idCounts.keys()];

  // 3 & 4. Dangling edges, self-loops
  const validEdges: ConceptEdge[] = [];
  for (const e of edges) {
    const missing = [e.from, e.to].filter((id) => !idCounts.has(id));
    if (missing.length) {
      const uniq = [...new Set(missing)];
      issues.push({
        type: "dangling_edge",
        severity: "error",
        message: `Edge ${e.from} -> ${e.to} (${e.relation}) references ${uniq
          .map((m) => `"${m}"`)
          .join(" and ")}, which ${uniq.length > 1 ? "are not node ids" : "is not a node id"}. Add the missing node or remove the edge.`,
        ids: uniq,
      });
    } else if (e.from === e.to) {
      issues.push({
        type: "self_loop",
        severity: "error",
        message: `Edge ${e.from} -> ${e.to} (${e.relation}) connects a node to itself. Remove it.`,
        ids: [e.from],
      });
    } else {
      validEdges.push(e);
    }
  }

  // 5. Duplicate edges (warning; deduped rather than failing)
  const seenEdges = new Set<string>();
  const reportedDupes = new Set<string>();
  const uniqueEdges: ConceptEdge[] = [];
  for (const e of validEdges) {
    const k = edgeKey(e);
    if (seenEdges.has(k)) {
      if (!reportedDupes.has(k)) {
        reportedDupes.add(k);
        issues.push({
          type: "duplicate_edge",
          severity: "warning",
          message: `Edge ${e.from} -> ${e.to} (${e.relation}) appears more than once. Keep only one copy.`,
          ids: [e.from, e.to],
        });
      }
    } else {
      seenEdges.add(k);
      uniqueEdges.push(e);
    }
  }

  // 6. Cycles (valid, deduplicated edges only)
  for (const cycle of findCycles(nodeIds, uniqueEdges)) {
    issues.push({
      type: "cycle",
      severity: "error",
      message: `Edges form a cycle: ${cycle.join(" → ")}. Remove or reverse one edge.`,
      ids: cycle.slice(0, -1),
    });
  }

  // 7. Grounding
  const normText = normalizeText(sourceText);
  const ungrounded = nodes.filter((n) => {
    const q = normalizeText(n.sourceQuote ?? "");
    return q.length < MIN_QUOTE_LENGTH || !normText.includes(q);
  });
  const groundedRatio = (nodes.length - ungrounded.length) / nodes.length;
  const groundingSeverity = groundedRatio < opts.minGroundedRatio ? "error" : "warning";
  for (const n of ungrounded) {
    issues.push({
      type: "ungrounded_node",
      severity: groundingSeverity,
      message: `Node "${n.id}": sourceQuote ${JSON.stringify(n.sourceQuote)} was not found verbatim in the text. Copy an exact phrase from the text, or remove the node if the text does not mention it.`,
      ids: [n.id],
    });
  }

  // 8. Isolated nodes
  const connected = new Set<string>();
  for (const e of uniqueEdges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  for (const id of nodeIds) {
    if (!connected.has(id) && nodeIds.length > 1) {
      issues.push({
        type: "isolated_node",
        severity: "warning",
        message: `Node "${id}" has no edges. Connect it to related concepts if the text supports it.`,
        ids: [id],
      });
    }
  }

  return finish(groundedRatio);
}
