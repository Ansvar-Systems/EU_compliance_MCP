#!/usr/bin/env node

/**
 * HTTP Server Entry Point for Smithery Hosted Deployment
 *
 * This provides Streamable HTTP transport for remote MCP clients.
 * Use src/index.ts for local stdio-based usage.
 */

import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

import { registerTools } from './tools/registry.js';
import { createSqliteAdapter } from './database/sqlite-adapter.js';
import type { DatabaseAdapter } from './database/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path - look for regulations.db in data folder
const DB_PATH = process.env.EU_COMPLIANCE_DB_PATH || join(__dirname, '..', 'data', 'regulations.db');

// HTTP server port
const PORT = parseInt(process.env.PORT || '3000', 10);

let db: DatabaseAdapter;

function getDatabase(): DatabaseAdapter {
  if (!db) {
    try {
      const sqliteDb = new Database(DB_PATH, { readonly: true });
      db = createSqliteAdapter(sqliteDb);
    } catch (error) {
      throw new Error(`Failed to open database at ${DB_PATH}: ${error}`);
    }
  }
  return db;
}

// Create MCP server instance
function createMcpServer(): Server {
  const db = getDatabase();
  const server = new Server(
    {
      name: 'eu-regulations-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all tools using shared registry
  registerTools(server, db);

  return server;
}

// Start HTTP server with Streamable HTTP transport
async function main() {
  const mcpServer = createMcpServer();

  // Map to store transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    // Health check endpoint
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'eu-regulations-mcp' }));
      return;
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      // Get or create session
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        // Reuse existing transport for this session
        transport = transports.get(sessionId)!;
      } else {
        // Create new transport with session ID generator
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        // Connect MCP server to transport
        await mcpServer.connect(transport);

        // Store transport by session ID once it's assigned
        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };
      }

      // Handle the request
      await transport.handleRequest(req, res);

      // Store transport if new session was created
      if (transport.sessionId && !transports.has(transport.sessionId)) {
        transports.set(transport.sessionId, transport);
      }

      return;
    }

    // 404 for other paths
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.listen(PORT, () => {
    console.error(`EU Regulations MCP server (HTTP) listening on port ${PORT}`);
    console.error(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.error(`Health check: http://localhost:${PORT}/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.error('Received SIGTERM, shutting down...');
    httpServer.close(() => {
      if (db) db.close();
      process.exit(0);
    });
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
