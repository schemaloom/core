import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { SchemaLoomExtractor, SchemaRegistry, SchemaHooks } from "../src/index.js";
import { GeminiProvider } from "../src/extraction/providers/gemini.js";

// Opening paragraphs of the Wikipedia article "Calculus"
const text = `Calculus is the mathematical study of continuous change, in the same way that geometry is the study of shape, and algebra is the study of generalizations of arithmetic operations. Originally called infinitesimal calculus or "the calculus of infinitesimals", it has two major branches, differential calculus and integral calculus. The former concerns instantaneous rates of change, and the slopes of curves, while the latter concerns accumulation of quantities, and areas under or between curves. These two branches are related to each other by the fundamental theorem of calculus, and they make use of the fundamental notions of convergence of infinite sequences and infinite series to a well-defined limit.`;

async function main() {
  const extractor = new SchemaLoomExtractor({ temperature: 0 });
  const provider = new GeminiProvider({ model: "gemini-2.5-flash", temperature: 0 });

  const result = await extractor.extract(
    text,
    SchemaRegistry.conceptGraph,
    provider.getLLM(),
    SchemaHooks.conceptGraph
  );

  console.log("Nodes:");
  for (const n of result.data.nodes) console.log(`  ${n.id}: ${n.label} — "${n.sourceQuote}"`);
  console.log("Edges:");
  for (const e of result.data.edges) console.log(`  ${e.from} --${e.relation}--> ${e.to}`);
  console.log("Validation:", JSON.stringify(result.validation, null, 2));
  if (result.errors) console.log("Errors:", result.errors);

  const out = new URL("./concept-graph.sample-output.json", import.meta.url);
  await writeFile(out, JSON.stringify({ data: result.data, validation: result.validation }, null, 2) + "\n");
  console.log(`Wrote ${out.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
