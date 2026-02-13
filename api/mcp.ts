import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Database from '@ansvar/mcp-sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { registerTools } from '../src/tools/registry.js';
import { createSqliteAdapter } from '../src/database/sqlite-adapter.js';
import type { DatabaseAdapter } from '../src/database/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'data', 'regulations.db');

let db: DatabaseAdapter | null = null;

function getDatabase(): DatabaseAdapter {
  if (!db) {
    const sqliteDb = new Database(DB_PATH, { readonly: true });
    db = createSqliteAdapter(sqliteDb);
  }
  return db;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
