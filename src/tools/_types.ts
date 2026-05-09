// Shared types for MCP tool handlers.
import type { ZodTypeAny } from "zod";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Database } from "better-sqlite3";

export interface ToolHandler<TInput = unknown> {
  definition: Tool;
  inputSchema: ZodTypeAny;
  handle(db: Database, input: TInput): Promise<CallToolResult> | CallToolResult;
}

export function textResult(payload: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}
