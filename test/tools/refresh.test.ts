// Tests for glossary_refresh — manual re-ingest endpoint.
//
// We don't exercise the real adapters (those would hit the network); instead
// we verify the dispatch / routing layer: schema validation, unknown-source
// errors, error envelope shape.
import { describe, expect, it } from "vitest";
import { tool as refreshTool } from "../../src/tools/refresh.js";
import { newSeededDb } from "../integration/corpus-fixture.js";

describe("glossary_refresh", () => {
  it("returns isError for unknown source key", async () => {
    const { db } = newSeededDb();
    const parsed = refreshTool.inputSchema.safeParse({ source: "nope-not-a-source" });
    expect(parsed.success).toBe(true);
    const result = await refreshTool.handle(db, parsed.data!);
    expect(result.isError).toBe(true);
    const text = (result.content?.[0] as { text: string }).text;
    expect(text).toMatch(/Unknown source key/);
    expect(text).toMatch(/mitre-attack/);
    expect(text).toMatch(/jargon-file/);
  });

  it("accepts every documented source key in the schema", () => {
    const keys = [
      "mitre-attack",
      "ofac-sdn",
      "vendor-aliases",
      "nist",
      "misp-galaxy",
      "enisa-glossary",
      "enisa-taxonomy",
      "jargon-file",
    ];
    for (const k of keys) {
      expect(refreshTool.inputSchema.safeParse({ source: k }).success).toBe(true);
    }
  });

  it("schema accepts no input (refresh-all path)", () => {
    expect(refreshTool.inputSchema.safeParse({}).success).toBe(true);
  });
});
