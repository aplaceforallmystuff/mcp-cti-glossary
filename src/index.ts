#!/usr/bin/env node
// mcp-cti-glossary — MCP server for CTI and cyber jargon disambiguation.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ensureDb } from "./ingest/ensure-db.js";
import { tools, listToolDefinitions } from "./tools/index.js";
import { errorResult } from "./tools/_types.js";

const SERVER_NAME = "mcp-cti-glossary";
const SERVER_VERSION = "0.1.0";

async function main() {
  const { db, source } = await ensureDb();

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listToolDefinitions(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = tools[name];
    if (!handler) {
      return errorResult(`Unknown tool: ${name}`);
    }
    const parsed = handler.inputSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return errorResult(`Invalid input for ${name}: ${parsed.error.message}`);
    }
    try {
      return await handler.handle(db, parsed.data);
    } catch (err) {
      return errorResult(`Tool ${name} threw: ${(err as Error).message}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `${SERVER_NAME} v${SERVER_VERSION} running on stdio (db: ${source})`,
  );
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
