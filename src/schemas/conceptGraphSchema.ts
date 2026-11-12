import { z } from "zod";

// NOTE: graph-wide rules (dangling edges, cycles, grounding) are deliberately NOT
// expressed as .refine(): refinements are not part of the JSON schema sent to the
// model, and whole-graph rules read better as a separate layer. See
// src/validation/graphChecks.ts.

export const ConceptNodeSchema = z.object({
  id: z.string().describe("Unique short snake_case id, e.g. 'derivative'"),
  label: z.string().describe("Human-readable concept name"),
  description: z.string().describe("One sentence explaining the concept"),
  sourceQuote: z
    .string()
    .describe("Exact phrase copied verbatim from the text that mentions this concept"),
});

export const ConceptEdgeSchema = z.object({
  from: z.string().describe("id of the source node"),
  to: z.string().describe("id of the target node"),
  relation: z
    .enum(["prerequisite_of", "part_of"])
    .describe(
      "prerequisite_of: 'from' must be understood before 'to'. part_of: 'from' is a component of 'to'."
    ),
});

export const ConceptGraphSchema = z.object({
  nodes: z.array(ConceptNodeSchema),
  edges: z.array(ConceptEdgeSchema),
});

export type ConceptNode = z.infer<typeof ConceptNodeSchema>;
export type ConceptEdge = z.infer<typeof ConceptEdgeSchema>;
export type ConceptGraph = z.infer<typeof ConceptGraphSchema>;
