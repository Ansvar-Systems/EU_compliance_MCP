#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { registerTools } from './tools/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path - look for regulations.db in data folder
const DB_PATH = process.env.EU_COMPLIANCE_DB_PATH || join(__dirname, '..', 'data', 'regulations.db');

function getDatabase(): Database.Database {
  try {
    return new Database(DB_PATH, { readonly: true });
  } catch (error) {
    throw new Error(`Failed to open database at ${DB_PATH}: ${error}`);
  }
}

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
