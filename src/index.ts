#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';

import { registerTools } from './tools/registry.js';
import { createSqliteAdapter } from './database/sqlite-adapter.js';
import type { DatabaseAdapter } from './database/types.js';
import type { AboutContext } from './tools/about.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path - look for regulations.db in data folder
const DB_PATH = process.env.EU_COMPLIANCE_DB_PATH || join(__dirname, '..', 'data', 'regulations.db');

// Read package version
const PKG_PATH = join(__dirname, '..', 'package.json');
const pkgVersion: string = JSON.parse(readFileSync(PKG_PATH, 'utf-8')).version;

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

/**
 * Compute about context at startup: version, DB fingerprint, build date.
 */
function computeAboutContext(): AboutContext {
  let fingerprint = 'unknown';
  let dbBuilt = new Date().toISOString();

  try {
    const dbBuffer = readFileSync(DB_PATH);
    fingerprint = createHash('sha256').update(dbBuffer).digest('hex').slice(0, 12);
    const dbStat = statSync(DB_PATH);
    dbBuilt = dbStat.mtime.toISOString();
  } catch {
    // Non-fatal: fingerprint stays 'unknown' if DB can't be read for hashing
  }

  return { version: pkgVersion, fingerprint, dbBuilt };
}

const aboutContext = computeAboutContext();

const server = new Server(
  {
    name: 'eu-regulations-mcp',
    version: pkgVersion,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register all tools using shared registry (with about context)
registerTools(server, getDatabase(), aboutContext);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('EU Regulations MCP server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
