// glossary_technique — ATT&CK technique by ID (T1234[.001]).
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getTermByExternalId } from "../db/queries.js";
import { textResult, errorResult, type ToolHandler } from "./_types.js";

export const inputSchema = z.object({
  technique_id: z
    .string()
    .regex(/^T\d{4}(\.\d{3})?$/, "Must match MITRE ATT&CK technique ID format (e.g. T1566 or T1566.001).")
    .describe("MITRE ATT&CK technique ID — e.g. 'T1566' or 'T1566.001'."),
});
type Input = z.infer<typeof inputSchema>;

export const tool: ToolHandler<Input> = {
  definition: {
    name: "glossary_technique",
    description:
      "Look up an ATT&CK technique by its canonical ID (e.g. T1566 for Phishing, T1566.001 for Spearphishing Attachment). Returns name, description, kill-chain phases, platforms, and ATT&CK URL.",
    inputSchema: zodToJsonSchema(inputSchema, { $refStrategy: "none" }) as Tool["inputSchema"],
  },
  inputSchema,
  handle(db, input) {
    const term = getTermByExternalId(db, "mitre-attack", input.technique_id);
    if (!term || term.category !== "cti_technique") {
      return errorResult(
        `Technique "${input.technique_id}" not found in MITRE ATT&CK. Verify the ID format and try glossary_search if you have a name instead.`
      );
    }
    return textResult({
      techniqueId: input.technique_id,
      name: term.term,
      definition: term.definition,
      metadata: term.metadata,
      attribution: term.attribution,
    });
  },
};
