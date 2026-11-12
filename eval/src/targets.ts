import { SchemaLoomExtractor } from "../../src/extraction/schemaLoomExtractor.js";
import { GeminiProvider } from "../../src/extraction/providers/gemini.js";
import { ConceptGraphSchema, type ConceptGraph } from "../../src/schemas/conceptGraphSchema.js";
import { SchemaHooks } from "../../src/schemas/index.js";
import { createPipeline } from "../../src/server/index.js";
import type { RunConfig, TargetOutput } from "./types.js";

export type Target = (text: string, cfg: RunConfig) => Promise<TargetOutput>;

/** Keep only a well-formed graph; anything else is "no output". */
function asGraph(data: unknown): ConceptGraph | null {
  const parsed = ConceptGraphSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/**
 * Calls the library directly: fast, used for most runs. Mirrors what the API
 * route does for the conceptGraph schema (same hooks, a fresh provider per call).
 */
export const libraryTarget: Target = async (text, cfg) => {
  const start = Date.now();
  const extractor = new SchemaLoomExtractor({ temperature: cfg.temperature, model: cfg.model });
  const provider = new GeminiProvider({ model: cfg.model, temperature: cfg.temperature });
  const res = await extractor.extract(text, ConceptGraphSchema, provider.getLLM(), SchemaHooks.conceptGraph);
  const graph = asGraph(res.data);
  return {
    // If every chunk failed there is no graph, only errors.
    graph: graph && graph.nodes.length === 0 && res.errors?.length ? null : graph,
    error: res.errors?.join("; "),
    latencyMs: Date.now() - start,
    attempts: 1,
    usage: res.usage,
  };
};

/**
 * Goes through the Hono app in-process: also tests routing, query parsing and
 * provider wiring. (This is the target that would have caught the bug where
 * ?temperature= never reached the model.)
 */
export const apiTarget: Target = async (text, cfg) => {
  const start = Date.now();
  const form = new FormData();
  form.append("file", new File([text], "input.txt"));
  form.append("schema", "conceptGraph");
  const url = `/extract?temperature=${cfg.temperature}&model=${encodeURIComponent(cfg.model)}`;
  const res = await createPipeline().request(url, { method: "POST", body: form });
  const body = (await res.json()) as any;
  const graph = body.success ? asGraph(body.data) : null;
  const errors: string[] | undefined = body.metadata?.errors;
  return {
    graph: graph && graph.nodes.length === 0 && errors?.length ? null : graph,
    error: body.success ? errors?.join("; ") : body.error,
    latencyMs: Date.now() - start,
    attempts: 1,
    usage: body.metadata?.usage,
  };
};

export const targets: Record<RunConfig["target"], Target> = { library: libraryTarget, api: apiTarget };
