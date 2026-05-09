#!/usr/bin/env node
/**
 * mcp-cti-glossary — MCP server for CTI and cyber jargon disambiguation.
 *
 * Phase 0 scaffold: server boots, registers no tools yet. Tool registration
 * lands in Phase 3. The DB layer and SourceAdapter interface land in Phase 1.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "mcp-cti-glossary";
const SERVER_VERSION = "0.1.0";

const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  throw new Error(
    `Tool '${request.params.name}' not implemented yet — Phase 3 lands the tool layer.`
  );
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
