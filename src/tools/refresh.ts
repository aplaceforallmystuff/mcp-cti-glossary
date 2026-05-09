// glossary_refresh — manual re-ingest of one source or all.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { upsertSource, upsertTerm } from "../db/queries.js";
import type { SourceAdapter } from "../sources/_adapter.js";
import { mitreAttackAdapter } from "../sources/mitre-attack.js";
import { ofacSdnAdapter } from "../sources/ofac-sdn.js";
import { vendorAliasesAdapter } from "../sources/vendor-aliases.js";
import { textResult, errorResult, type ToolHandler } from "./_types.js";

const ADAPTERS_BY_KEY: Record<string, SourceAdapter> = {
  "mitre-attack": mitreAttackAdapter,
  "ofac-sdn": ofacSdnAdapter,
  "vendor-aliases": vendorAliasesAdapter,
};

export const inputSchema = z.object({
  source: z
    .string()
    .optional()
    .describe("Source key to refresh (mitre-attack | ofac-sdn | vendor-aliases). Omit to refresh all."),
});
type Input = z.infer<typeof inputSchema>;

async function refreshOne(db: Parameters<ToolHandler["handle"]>[0], adapter: SourceAdapter): Promise<{ key: string; count: number; durationMs: number }> {
  const start = Date.now();
  const sourceId = upsertSource(db, {
    sourceKey: adapter.meta.key,
    name: adapter.meta.name,
    homepage: adapter.meta.homepage,
    licenseName: adapter.meta.license.name,
    licenseUrl: adapter.meta.license.url ?? null,
    attribution: adapter.meta.license.attribution,
    lastRefreshedAt: new Date().toISOString(),
    status: "ok",
  });
  const docs = await adapter.fetch();
  let count = 0;
  for (const doc of docs) {
    for (const term of adapter.normalize(doc)) {
      upsertTerm(db, {
        sourceId,
        externalId: term.externalId,
        term: term.term,
        definition: term.definition,
        category: term.category,
        aliases: term.aliases,
        metadata: term.metadata,
      });
      count++;
    }
  }
  return { key: adapter.meta.key, count, durationMs: Date.now() - start };
}

export const tool: ToolHandler<Input> = {
  definition: {
    name: "glossary_refresh",
    description:
      "Manually re-ingest one or all sources. Use after a source has had updates (e.g. weekly OFAC SDN refresh, ATT&CK release). Returns per-source term counts.",
    inputSchema: zodToJsonSchema(inputSchema, { $refStrategy: "none" }) as Tool["inputSchema"],
  },
  inputSchema,
  async handle(db, input) {
    const targets: SourceAdapter[] = [];
    if (input.source) {
      const adapter = ADAPTERS_BY_KEY[input.source];
      if (!adapter) {
        return errorResult(
          `Unknown source key "${input.source}". Available: ${Object.keys(ADAPTERS_BY_KEY).join(", ")}.`
        );
      }
      targets.push(adapter);
    } else {
      targets.push(...Object.values(ADAPTERS_BY_KEY));
    }

    const results: Array<{ key: string; count: number; durationMs: number; error?: string }> = [];
    for (const adapter of targets) {
      try {
        results.push(await refreshOne(db, adapter));
      } catch (err) {
        results.push({
          key: adapter.meta.key,
          count: 0,
          durationMs: 0,
          error: (err as Error).message,
        });
      }
    }

    return textResult({
      refreshed: results.length,
      results,
    });
  },
};
