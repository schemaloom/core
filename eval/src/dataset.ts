import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CaseSchema, type EvalCase } from "./types.js";

export const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "cases");

/**
 * Load and validate every eval/cases/*.json. Anything malformed throws, naming
 * the file: a typo in a test case must fail loudly, never silently score zero.
 */
export function loadCases(dir: string = CASES_DIR): EvalCase[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const seen = new Set<string>();
  return files.map((f) => {
    const parsed = CaseSchema.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (!parsed.success) throw new Error(`Invalid case file ${f}: ${parsed.error.message}`);
    const c = parsed.data;

    if (c.id !== f.replace(/\.json$/, "")) throw new Error(`${f}: id "${c.id}" must match the file name`);
    if (seen.has(c.id)) throw new Error(`${f}: duplicate case id "${c.id}"`);
    seen.add(c.id);

    const names = new Set(c.expect.concepts.map((x) => x.name));
    for (const e of c.expect.edges) {
      for (const end of [e.from, e.to]) {
        if (!names.has(end)) throw new Error(`${f}: edge endpoint "${end}" is not in expect.concepts`);
      }
    }
    const [lo, hi] = c.expect.nodeCountRange;
    if (lo > hi) throw new Error(`${f}: nodeCountRange is inverted`);

    const text = readFileSync(join(dir, c.articlePath), "utf8");
    if (!text.trim()) throw new Error(`${f}: article ${c.articlePath} is empty`);
    return { ...c, text };
  });
}

export function selectCases(cases: EvalCase[], split: "dev" | "test" | "all", ids: string[] = []): EvalCase[] {
  let out = split === "all" ? cases : cases.filter((c) => c.split === split);
  if (ids.length) {
    const missing = ids.filter((id) => !cases.some((c) => c.id === id));
    if (missing.length) throw new Error(`Unknown case id(s): ${missing.join(", ")}`);
    out = cases.filter((c) => ids.includes(c.id));
  }
  return out;
}

/** Hash of every case's expectations and article text, so a run can say which dataset it used. */
export function hashDataset(cases: EvalCase[]): string {
  const h = createHash("sha256");
  for (const c of [...cases].sort((a, b) => a.id.localeCompare(b.id))) {
    h.update(JSON.stringify({ ...c }));
  }
  return h.digest("hex").slice(0, 12);
}
