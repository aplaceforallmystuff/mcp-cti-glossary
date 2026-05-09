// MCP tool registry.
import type { ToolHandler } from "./_types.js";
import { tool as disambiguate } from "./disambiguate.js";
import { tool as lookup } from "./lookup.js";
import { tool as search } from "./search.js";
import { tool as actor } from "./actor.js";
import { tool as technique } from "./technique.js";
import { tool as refresh } from "./refresh.js";
import { tool as stats } from "./stats.js";

export const tools: Record<string, ToolHandler<unknown>> = {
  glossary_disambiguate: disambiguate as ToolHandler<unknown>,
  glossary_lookup: lookup as ToolHandler<unknown>,
  glossary_search: search as ToolHandler<unknown>,
  glossary_actor: actor as ToolHandler<unknown>,
  glossary_technique: technique as ToolHandler<unknown>,
  glossary_refresh: refresh as ToolHandler<unknown>,
  glossary_stats: stats as ToolHandler<unknown>,
};

export function listToolDefinitions() {
  return Object.values(tools).map((t) => t.definition);
}
