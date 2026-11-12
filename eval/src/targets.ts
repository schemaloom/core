import { SchemaLoomExtractor } from "../../src/extraction/schemaLoomExtractor.js";
import { GeminiProvider } from "../../src/extraction/providers/gemini.js";
import { ConceptGraphSchema, type ConceptGraph } from "../../src/schemas/conceptGraphSchema.js";
import { SchemaHooks } from "../../src/schemas/index.js";
import { createPipeline } from "../../src/server/index.js";
import type { EvalCase, RunConfig, TargetOutput } from "./types.js";

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

/**
 * Deterministic oracle: builds the graph straight from a case's expectations, no
 * model and no API key. It should score ~perfect, so it exercises the harness
 * (loading, runner, scorers, report, cache) end to end and doubles as a CI smoke
 * test. A failing stub run means the harness is broken, not the model.
 */
const stubCases = new Map<string, EvalCase>();
export const registerStubCases = (cases: EvalCase[]) => cases.forEach((c) => stubCases.set(c.text, c));

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export const stubTarget: Target = async (text) => {
  const start = Date.now();
  const c = stubCases.get(text);
  if (!c) throw new Error("stub target: unknown input text (call registerStubCases first)");
  const lower = text.toLowerCase();
  const nodes = c.expect.concepts.map((k) => {
    const phrase = [k.name, ...k.aliases].find((p) => lower.includes(p.toLowerCase())) ?? k.name;
    const i = lower.indexOf(phrase.toLowerCase());
    return {
      id: slug(k.name), label: k.name, description: `About ${k.name}.`,
      sourceQuote: i >= 0 ? text.slice(i, i + phrase.length) : phrase,
    };
  });
  const ids = new Map(c.expect.concepts.map((k) => [k.name.toLowerCase(), slug(k.name)]));
  const edges = c.expect.edges.flatMap((e) => {
    const from = ids.get(e.from.toLowerCase()), to = ids.get(e.to.toLowerCase());
    return from && to ? [{ from, to, relation: e.relation }] : [];
  });
  return { graph: { nodes, edges }, latencyMs: Date.now() - start, attempts: 1 };
};

export const targets: Record<RunConfig["target"], Target> = { library: libraryTarget, api: apiTarget, stub: stubTarget };
