import { z } from "zod";
import type { ConceptGraph } from "../../src/schemas/conceptGraphSchema.js";

// ---------------------------------------------------------------- cases

export const RelationSchema = z.enum(["prerequisite_of", "part_of"]);

export const CaseSchema = z.object({
  id: z.string().min(1),
  split: z.enum(["dev", "test"]),
  tags: z.array(z.string()),
  articlePath: z.string(),
  expect: z.object({
    concepts: z
      .array(z.object({ name: z.string().min(1), aliases: z.array(z.string()).default([]) }))
      .min(1),
    edges: z.array(z.object({ from: z.string(), to: z.string(), relation: RelationSchema })).min(1),
    nodeCountRange: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  }).strict(),
}).strict();

export type CaseFile = z.infer<typeof CaseSchema>;
/** A validated case plus the article text it points at. */
export type EvalCase = CaseFile & { text: string };

// ---------------------------------------------------------------- config

export interface RunConfig {
  model: string;
  temperature: number;
  /** Reserved: the extractor has no retry loop yet. Recorded and cached on so step 4 only has to wire it in. */
  retries: number;
  repeats: number;
  concurrency: number;
  timeoutMs: number;
  split: "dev" | "test" | "all";
  target: "library" | "api";
  useCache: boolean;
  /** Restrict to these case ids (empty = all in split). */
  caseIds: string[];
}

// ---------------------------------------------------------------- target output

export interface TargetOutput {
  graph: ConceptGraph | null;
  error?: string;
  latencyMs: number;
  /** 1 until the retry loop exists. 0 means the call never completed (timeout / thrown). */
  attempts: number;
  usage?: { inputTokens: number; outputTokens: number };
}

// ---------------------------------------------------------------- scores

export interface Score {
  name: string;
  /** 0 to 1 */
  value: number;
  pass: boolean;
  /** Gate scores decide pass/fail for the trial; the rest are tracked metrics. */
  gate: boolean;
  details?: Record<string, unknown>;
}

export interface TrialResult {
  caseId: string;
  trial: number;
  output: TargetOutput;
  scores: Score[];
  pass: boolean;
}

// ---------------------------------------------------------------- run record

export interface RunSummary {
  trials: number;
  cases: number;
  passRate: number;
  consistentCases: number;
  meanScores: Record<string, number>;
  /** Trials failing each gate scorer. */
  failuresByScorer: Record<string, number>;
  /** Error-severity checkGraph issues, counted by type across trials. */
  failuresByIssue: Record<string, number>;
  reversedEdges: number;
  latencyP50: number;
  latencyP95: number;
  tokens: { input: number; output: number };
  byTag: Record<string, { trials: number; passRate: number }>;
  byCase: Record<string, { passRate: number; trials: number }>;
}

export interface RunRecord {
  runId: string;
  createdAt: string;
  gitCommit: string;
  gitDirty: boolean;
  datasetHash: string;
  promptVersion: string;
  config: RunConfig;
  /** Set when this record was produced by rescoring another run's stored outputs. */
  replayOf?: string;
  trials: TrialResult[];
  summary: RunSummary;
}
