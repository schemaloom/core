import { jest, beforeAll, beforeEach, describe, test, expect } from "@jest/globals";

// The route builds a GeminiProvider and a SchemaLoomExtractor per request; mock both
// so no network or API key is needed and we can assert on how they were wired.
const providerCtor = jest.fn();
const extractFn = jest.fn<(...a: any[]) => Promise<any>>();

jest.unstable_mockModule("../src/extraction/providers/gemini.js", () => ({
  GeminiProvider: class {
    constructor(opts: unknown) { providerCtor(opts); }
    getLLM() { return { fake: "llm" }; }
  },
  default: {},
}));
jest.unstable_mockModule("../src/extraction/schemaLoomExtractor.js", () => ({
  PROMPT_VERSION: "test",
  SchemaLoomExtractor: class { extract = extractFn; },
}));

let app: { request: (url: string, init?: RequestInit) => Response | Promise<Response> };

beforeAll(async () => {
  const { createPipeline } = await import("../src/server/index.js");
  app = createPipeline();
});

beforeEach(() => {
  providerCtor.mockClear();
  extractFn.mockReset();
  extractFn.mockResolvedValue({ data: [], chunks: 1, processingTime: 1, errors: [], validation: undefined, usage: undefined });
});

const upload = (fields: Record<string, string> = {}, withFile = true) => {
  const form = new FormData();
  if (withFile) form.append("file", new File(["some text"], "in.txt"));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return { method: "POST", body: form };
};
const post = async (url: string, init: RequestInit) => {
  const res = await app.request(url, init);
  return { status: res.status, body: (await res.json()) as any };
};

describe("GET /health", () => {
  test("returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

describe("POST /extract", () => {
  test("400 when no file is uploaded", async () => {
    const { status, body } = await post("/extract", upload({}, false));
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  test.each([
    ["chunkSize=10", /chunkSize/],
    ["chunkSize=5000000", /chunkSize/],
    ["chunkSize=2000&chunkOverlap=2000", /chunkOverlap/],
    ["temperature=3", /temperature/],
  ])("400 on invalid option %s", async (qs, msg) => {
    const { status, body } = await post(`/extract?${qs}`, upload());
    expect(status).toBe(400);
    expect(body.error).toMatch(msg);
    expect(extractFn).not.toHaveBeenCalled();
  });

  test("400 on unknown schema, listing the available ones", async () => {
    const { status, body } = await post("/extract", upload({ schema: "nope" }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/Unknown predefined schema.*conceptGraph/);
  });

  test("success: passes temperature and model to the provider (regression)", async () => {
    const { status, body } = await post("/extract?temperature=0.7&model=test-model", upload());
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(providerCtor).toHaveBeenCalledWith({ temperature: 0.7, model: "test-model" });
    expect(body.metadata.options).toMatchObject({ temperature: 0.7, model: "test-model" });
    expect(body.metadata.schema).toBe("event");
  });

  test("conceptGraph schema uses its hooks", async () => {
    await post("/extract", upload({ schema: "conceptGraph" }));
    const hooks = extractFn.mock.calls[0][3];
    expect(typeof hooks.postValidate).toBe("function");
    expect(typeof hooks.merge).toBe("function");
  });

  test("500 with the message when extraction throws", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    extractFn.mockRejectedValue(new Error("boom"));
    const { status, body } = await post("/extract", upload());
    expect(status).toBe(500);
    expect(body).toEqual({ success: false, error: "boom" });
  });
});

describe("POST /extract/custom", () => {
  const json = (b: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  test("400 without content", async () => {
    const { status } = await post("/extract/custom", json({ schemaDefinition: { type: "array" } }));
    expect(status).toBe(400);
  });

  test("400 without schemaDefinition", async () => {
    const { status } = await post("/extract/custom", json({ content: "x" }));
    expect(status).toBe(400);
  });

  test("400 on invalid options", async () => {
    const { status } = await post("/extract/custom", json({ content: "x", schemaDefinition: { type: "array" }, temperature: 5 }));
    expect(status).toBe(400);
  });

  test("success builds a schema and wires options into the provider", async () => {
    const def = { type: "object", properties: { name: { type: "string" } } };
    const { status, body } = await post("/extract/custom", json({ content: "x", schemaDefinition: def, temperature: 0.2, model: "m" }));
    expect(status).toBe(200);
    expect(body.metadata.schema).toBe("Custom Schema");
    expect(providerCtor).toHaveBeenCalledWith({ temperature: 0.2, model: "m" });
    const schema = extractFn.mock.calls[0][1];
    expect(schema.safeParse({ name: "a" }).success).toBe(true);
    expect(schema.safeParse({ name: 1 }).success).toBe(false);
  });
});

describe("GET /extract", () => {
  test("lists available schemas", async () => {
    const res = await app.request("/extract");
    const body = (await res.json()) as any;
    expect(body.availableSchemas).toContain("conceptGraph");
  });
});
