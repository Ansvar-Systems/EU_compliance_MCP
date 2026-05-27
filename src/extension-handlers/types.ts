// Local subset of @ansvar/mcp-base types needed for extension handlers.
//
// mcp-base doesn't ship as an npm package with type exports — it's pulled in
// via FROM in the chassis Dockerfile and code is loaded at runtime via dynamic
// import in chassis-bootstrap.ts. To compile this consumer's TypeScript we
// declare a structural subset of the chassis types here.
//
// Keep in sync with mcp-base/src/tools/handlers/types.ts +
// mcp-base/src/transport/server-factory.ts (ExtensionTool).
// Pinned: mcp-base v0.1.28+ (Phase 4d extensionHandlers API).

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
}

// Subset of the chassis ToolHandlerContext — only fields our handlers use.
export interface ToolHandlerContext {
  db: SqliteDatabase;
  manifest: unknown;
  coverageSummary: string;
}

// Subset of @modelcontextprotocol/sdk's CallToolResult.
export interface CallToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
) => Promise<CallToolResult>;

// Subset of @modelcontextprotocol/sdk's Tool definition.
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ExtensionTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export function textResult(payload: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

export function markdownResult(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}

export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}
