// glossary_lookup — exact term-or-alias match across all sources.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { lookupExact } from "../db/queries.js";
import { textResult, type ToolHandler } from "./_types.js";

export const inputSchema = z.object({
  term: z.string().min(1).describe("Exact term or alias to look up (case-insensitive)."),
  source: z.string().optional().describe("Optional source key to constrain results."),
});
type Input = z.infer<typeof inputSchema>;

export const tool: ToolHandler<Input> = {
  definition: {
    name: "glossary_lookup",
    description:
      "Direct multi-source lookup by exact term or alias. Returns all matching entries across sources with attribution.",
    inputSchema: zodToJsonSchema(inputSchema, { $refStrategy: "none" }) as Tool["inputSchema"],
  },
  inputSchema,
  handle(db, input) {
    const results = lookupExact(db, input.term, { source: input.source });
    return textResult({
      term: input.term,
      count: results.length,
      results: results.map((r) => ({
        term: r.term,
        source: r.sourceKey,
        category: r.category,
        externalId: r.externalId,
        aliases: r.aliases,
        definition: r.definition,
        attribution: r.attribution,
      })),
    });
  },
};
