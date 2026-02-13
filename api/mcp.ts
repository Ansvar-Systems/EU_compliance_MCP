import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Database from '@ansvar/mcp-sqlite';
import { join } from 'path';
import { existsSync, copyFileSync } from 'fs';

import { registerTools } from '../src/tools/registry.js';
import { createSqliteAdapter } from '../src/database/sqlite-adapter.js';
import type { DatabaseAdapter } from '../src/database/types.js';

// Vercel Lambda filesystem is read-only except /tmp.
// SQLite needs to create lock/journal files, so we copy the DB to /tmp.
const SOURCE_DB = process.env.EU_COMPLIANCE_DB_PATH
  || join(process.cwd(), 'data', 'regulations.db');
const TMP_DB = '/tmp/regulations.db';

let db: DatabaseAdapter | null = null;

function getDatabase(): DatabaseAdapter {
  if (!db) {
    // Copy to /tmp on cold start (writable filesystem for SQLite locks)
    if (!existsSync(TMP_DB)) {
      copyFileSync(SOURCE_DB, TMP_DB);
    }
    const sqliteDb = new Database(TMP_DB, { readonly: true });
    db = createSqliteAdapter(sqliteDb);
  }
  return db;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      name: 'eu-regulations-mcp',
      version: '1.0.0',
      protocol: 'mcp-streamable-http',
    });
    return;
  }

  try {
    if (!existsSync(SOURCE_DB)) {
      res.status(500).json({
        error: `Database not found at ${SOURCE_DB}`,
        cwd: process.cwd(),
      });
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
      enableJsonResponse: true,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('MCP handler error:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}
