// glossary_disambiguate — headline tool. Multi-source ranked candidates for ambiguous terms.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { lookupExact, searchTerms } from "../db/queries.js";
import { textResult, type ToolHandler } from "./_types.js";
import type { TermSearchResult } from "../db/types.js";

export const inputSchema = z.object({
  term: z.string().min(1).describe("Ambiguous term to disambiguate (e.g. 'NICKEL', 'Salt Typhoon', 'Phishing')."),
  context: z
    .string()
    .optional()
    .describe("Optional sentence-level context to help future ranking — currently informational."),
});
type Input = z.infer<typeof inputSchema>;

function dedupe(results: TermSearchResult[]): TermSearchResult[] {
  const seen = new Set<string>();
  const out: TermSearchResult[] = [];
  for (const r of results) {
    const key = `${r.sourceKey}:${r.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export const tool: ToolHandler<Input> = {
  definition: {
    name: "glossary_disambiguate",
    description:
      "Headline disambiguation tool. Returns ranked candidates across all sources for an ambiguous term — exact-match hits first (term and aliases), then full-text fuzzy matches. Each candidate carries category and source attribution so the caller can choose the right sense in context.",
    inputSchema: zodToJsonSchema(inputSchema, { $refStrategy: "none" }) as Tool["inputSchema"],
  },
  inputSchema,
  handle(db, input) {
    const exact = lookupExact(db, input.term);
    const fuzzy = searchTerms(db, input.term, { limit: 15 });

    const merged = dedupe([...exact, ...fuzzy]);

    return textResult({
      term: input.term,
      context: input.context ?? null,
      exactMatchCount: exact.length,
      totalCandidateCount: merged.length,
      candidates: merged.map((r, idx) => ({
        rank: idx + 1,
        term: r.term,
        source: r.sourceKey,
        category: r.category,
        externalId: r.externalId,
        aliases: r.aliases,
        definition: r.definition,
        matchKind: idx < exact.length ? "exact" : "fuzzy",
        attribution: r.attribution,
      })),
    });
  },
};
