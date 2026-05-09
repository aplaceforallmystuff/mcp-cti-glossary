// glossary_actor — APT-specific lookup with aliases + linked techniques.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { lookupExact } from "../db/queries.js";
import { textResult, errorResult, type ToolHandler } from "./_types.js";

export const inputSchema = z.object({
  name_or_alias: z.string().min(1).describe("Threat actor canonical name or any known alias."),
});
type Input = z.infer<typeof inputSchema>;

export const tool: ToolHandler<Input> = {
  definition: {
    name: "glossary_actor",
    description:
      "Threat actor lookup. Resolves any known alias to the canonical entry, returns full alias list and metadata. If multiple sources have the actor (e.g. ATT&CK + vendor-aliases), returns all entries.",
    inputSchema: zodToJsonSchema(inputSchema, { $refStrategy: "none" }) as Tool["inputSchema"],
  },
  inputSchema,
  handle(db, input) {
    const all = lookupExact(db, input.name_or_alias);
    const actors = all.filter((r) => r.category === "cti_actor");

    if (actors.length === 0) {
      return errorResult(
        `No threat actor found matching "${input.name_or_alias}". Try glossary_search for fuzzy matching.`
      );
    }

    return textResult({
      query: input.name_or_alias,
      count: actors.length,
      actors: actors.map((r) => ({
        canonicalName: r.term,
        source: r.sourceKey,
        externalId: r.externalId,
        aliases: r.aliases,
        definition: r.definition,
        metadata: r.metadata,
        attribution: r.attribution,
      })),
    });
  },
};
