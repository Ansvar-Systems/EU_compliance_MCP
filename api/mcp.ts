import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Database from '@ansvar/mcp-sqlite';
import { join } from 'path';

import { registerTools } from '../src/tools/registry.js';
import { createSqliteAdapter } from '../src/database/sqlite-adapter.js';
import type { DatabaseAdapter } from '../src/database/types.js';

// Vercel bundles includeFiles relative to project root
// process.cwd() points to the project root in Vercel Lambda
const DB_PATH = process.env.EU_COMPLIANCE_DB_PATH
  || join(process.cwd(), 'data', 'regulations.db');

let db: DatabaseAdapter | null = null;

function getDatabase(): DatabaseAdapter {
  if (!db) {
    const sqliteDb = new Database(DB_PATH, { readonly: true });
    db = createSqliteAdapter(sqliteDb);
  }
  return db;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers for remote MCP clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const database = getDatabase();

  const server = new Server(
    { name: 'eu-regulations-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  registerTools(server, database);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}
