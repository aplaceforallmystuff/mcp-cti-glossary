// glossary_search — full-text fuzzy search across the corpus (FTS5 + bm25).
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { searchTerms } from "../db/queries.js";
import { TermCategorySchema } from "../sources/_adapter.js";
import { textResult, type ToolHandler } from "./_types.js";

export const inputSchema = z.object({
  query: z.string().min(1).describe("Free-text query to search term names and definitions."),
  source: z.string().optional().describe("Optional source key: mitre-attack | ofac-sdn | vendor-aliases."),
  category: TermCategorySchema.optional().describe(
    "Optional category: cultural | cti_actor | cti_technique | cti_software | cti_tactic | regulatory | general."
  ),
  limit: z.number().int().min(1).max(100).default(20).describe("Max results (1-100)."),
});
type Input = z.infer<typeof inputSchema>;

export const tool: ToolHandler<Input> = {
  definition: {
    name: "glossary_search",
    description:
      "Full-text fuzzy search across the CTI / cyber glossary corpus (~20K terms). Returns ranked matches with source attribution.",
    inputSchema: zodToJsonSchema(inputSchema, { $refStrategy: "none" }) as Tool["inputSchema"],
  },
  inputSchema,
  handle(db, input) {
    const results = searchTerms(db, input.query, {
      source: input.source,
      category: input.category,
      limit: input.limit,
    });
    return textResult({
      query: input.query,
      count: results.length,
      results: results.map((r) => ({
        term: r.term,
        source: r.sourceKey,
        category: r.category,
        externalId: r.externalId,
        aliases: r.aliases,
        definition: r.definition,
        rank: r.rank,
        attribution: r.attribution,
      })),
    });
  },
};
