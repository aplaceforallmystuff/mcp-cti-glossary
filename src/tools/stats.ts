// glossary_stats — corpus health and per-source counts.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { listSources } from "../db/queries.js";
import { textResult, type ToolHandler } from "./_types.js";

export const inputSchema = z.object({
  staleThresholdDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .default(30)
    .describe("Sources with last_refreshed_at older than this are flagged stale (default 30)."),
});
type Input = z.infer<typeof inputSchema>;

export const tool: ToolHandler<Input> = {
  definition: {
    name: "glossary_stats",
    description:
      "Corpus health check. Returns per-source term counts, last-refresh timestamps, and a stale-source flag for any source older than the threshold.",
    inputSchema: zodToJsonSchema(inputSchema, { $refStrategy: "none" }) as Tool["inputSchema"],
  },
  inputSchema,
  handle(db, input) {
    const sources = listSources(db);
    const staleMs = input.staleThresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const perSource = sources.map((s) => {
      const countRow = db
        .prepare("SELECT COUNT(*) AS c FROM terms WHERE source_id = ?")
        .get(s.id) as { c: number };
      const refreshedAt = s.lastRefreshedAt ? new Date(s.lastRefreshedAt).getTime() : null;
      const ageMs = refreshedAt !== null ? now - refreshedAt : null;
      const isStale = refreshedAt === null || ageMs! > staleMs;
      return {
        sourceKey: s.sourceKey,
        name: s.name,
        termCount: countRow.c,
        lastRefreshedAt: s.lastRefreshedAt,
        ageDays: ageMs !== null ? Math.floor(ageMs / 86400000) : null,
        status: s.status,
        isStale,
        attribution: s.attribution,
      };
    });

    const totalTerms = perSource.reduce((acc, r) => acc + r.termCount, 0);
    const staleCount = perSource.filter((r) => r.isStale).length;

    return textResult({
      totalTerms,
      sourceCount: perSource.length,
      staleCount,
      staleThresholdDays: input.staleThresholdDays,
      sources: perSource,
    });
  },
};
