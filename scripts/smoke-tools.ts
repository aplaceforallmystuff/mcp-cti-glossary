#!/usr/bin/env node
// Tool smoke test: exercises each MCP tool against the populated local DB.
import { openDb } from "../src/db/connection.js";
import { tools } from "../src/tools/index.js";

async function callTool(name: string, args: unknown): Promise<void> {
  const handler = tools[name];
  if (!handler) {
    console.error(`✗ ${name}: not registered`);
    return;
  }
  const parsed = handler.inputSchema.safeParse(args);
  if (!parsed.success) {
    console.error(`✗ ${name}: input validation failed: ${parsed.error.message}`);
    return;
  }
  const result = await handler.handle(db, parsed.data);
  const text = result.content[0]?.type === "text" ? result.content[0].text : "(non-text)";
  const preview = text.length > 600 ? text.slice(0, 600) + "\n…[truncated]" : text;
  console.error(`\n=== ${name} ${JSON.stringify(args)} ===`);
  console.error(preview);
}

const db = openDb();

await callTool("glossary_stats", {});
await callTool("glossary_search", { query: "phishing", limit: 3 });
await callTool("glossary_lookup", { term: "Salt Typhoon" });
await callTool("glossary_disambiguate", { term: "NICKEL" });
await callTool("glossary_actor", { name_or_alias: "Fancy Bear" });
await callTool("glossary_technique", { technique_id: "T1566" });

db.close();
