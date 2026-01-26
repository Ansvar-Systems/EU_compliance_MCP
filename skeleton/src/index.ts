#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MCP SERVER ENTRY POINT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file is the main entry point for the MCP (Model Context Protocol)
 * server. It handles:
 *
 *   1. Server initialization and configuration
 *   2. Database connection management (singleton pattern)
 *   3. Tool registration (ListTools handler)
 *   4. Tool execution (CallTool handler)
 *   5. Error handling and graceful shutdown
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE OVERVIEW
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   ┌─────────────────┐       stdio       ┌─────────────────┐
 *   │  AI Assistant   │◄─────────────────►│   This Server   │
 *   │  (Claude, etc)  │   JSON messages   │   (index.ts)    │
 *   └─────────────────┘                   └────────┬────────┘
 *                                                  │
 *                                                  │ SQL queries
 *                                                  ▼
 *                                         ┌─────────────────┐
 *                                         │    SQLite DB    │
 *                                         │  (embedded)     │
 *                                         └─────────────────┘
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MCP PROTOCOL OVERVIEW
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The Model Context Protocol (MCP) enables AI assistants to use external
 * tools. The protocol defines:
 *
 *   - ListTools: Returns available tools with their schemas
 *   - CallTool: Executes a tool with provided arguments
 *
 * This server uses the stdio transport, meaning it communicates via
 * standard input/output streams (suitable for local execution).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CUSTOMIZATION GUIDE
 * ───────────────────────────────────────────────────────────────────────────
 *
 * To adapt this template for your MCP server:
 *
 *   1. Update SERVER_NAME and SERVER_VERSION constants
 *   2. Update DB_ENV_VAR and DEFAULT_DB_PATH for your database
 *   3. Define your tools in the TOOLS array
 *   4. Import and wire up tool functions in the CallTool handler
 *   5. Update error messages and logging as needed
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @module index
 * @author Ansvar Systems AB
 * @license Apache-2.0
 *
 * @example Running the server
 * ```bash
 * # Direct execution
 * node dist/index.js
 *
 * # Via npm
 * npm start
 *
 * # Development with hot reload
 * npm run dev
 *
 * # With custom database path
 * YOUR_DB_PATH=/path/to/db.sqlite node dist/index.js
 * ```
 *
 * @example Testing with MCP Inspector
 * ```bash
 * npx @anthropic/mcp-inspector node dist/index.js
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════════════════════

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ───────────────────────────────────────────────────────────────────────────
// Tool Imports
// ───────────────────────────────────────────────────────────────────────────
// Import your tool functions here. Each tool should be in its own file
// under src/tools/ for maintainability.
//
// Example:
//   import { searchContent, SearchInput } from './tools/search.js';
//   import { getItem, GetItemInput } from './tools/get-item.js';
//   import { listContent, ListInput } from './tools/list.js';
// ───────────────────────────────────────────────────────────────────────────

import { searchContent, SearchInput } from './tools/search.js';
import { getItem, GetItemInput } from './tools/get-item.js';
import { listSources, ListInput } from './tools/list.js';
import { lookupDefinition, DefinitionInput } from './tools/definitions.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Server identification
 *
 * These values are reported to MCP clients and appear in logs.
 * Update these for your specific server.
 */
const SERVER_NAME = 'your-mcp-server';      // TODO: Change this
const SERVER_VERSION = '0.1.0';              // TODO: Keep in sync with package.json

/**
 * Database configuration
 *
 * The server looks for the database in this order:
 *   1. Environment variable (if set)
 *   2. Default path relative to this file
 *
 * The default path assumes the standard directory structure:
 *   your-mcp-server/
 *   ├── dist/index.js      (this file, compiled)
 *   └── data/database.db   (database file)
 */
const DB_ENV_VAR = 'YOUR_MCP_DB_PATH';       // TODO: Change this
const DEFAULT_DB_PATH = '../data/database.db';

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Database singleton instance
 *
 * We use a singleton pattern for the database connection because:
 *   1. Opening a database is relatively expensive
 *   2. SQLite handles concurrent reads well with a single connection
 *   3. We only need read access (no write conflicts)
 *
 * The connection is lazy-loaded (created on first use) to avoid
 * startup failures if the database doesn't exist yet.
 */
let dbInstance: Database.Database | null = null;

/**
 * Get the database connection (singleton)
 *
 * Creates the connection on first call, returns cached instance thereafter.
 * Opens database in read-only mode for safety.
 *
 * @returns Database connection
 * @throws Error if database file doesn't exist or can't be opened
 *
 * @example
 * ```typescript
 * const db = getDb();
 * const rows = db.prepare('SELECT * FROM items').all();
 * ```
 */
function getDb(): Database.Database {
  if (!dbInstance) {
    // Resolve database path
    const dbPath = process.env[DB_ENV_VAR] || getDefaultDbPath();

    // Log for debugging (visible in MCP inspector)
    console.error(`[${SERVER_NAME}] Opening database: ${dbPath}`);

    // Open in read-only mode
    // - Prevents accidental modifications
    // - Allows concurrent access from multiple processes
    dbInstance = new Database(dbPath, { readonly: true });

    // Enable foreign key enforcement (good practice)
    dbInstance.pragma('foreign_keys = ON');

    console.error(`[${SERVER_NAME}] Database opened successfully`);
  }

  return dbInstance;
}

/**
 * Calculate default database path
 *
 * Resolves the path relative to this file's location.
 * Works correctly whether running from dist/ or src/.
 *
 * @returns Absolute path to database file
 */
function getDefaultDbPath(): string {
  // __dirname equivalent for ES modules
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  return path.resolve(__dirname, DEFAULT_DB_PATH);
}

/**
 * Close database connection
 *
 * Called during graceful shutdown to release resources.
 */
function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.error(`[${SERVER_NAME}] Database closed`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tool Registry
 *
 * Define all available tools here. Each tool needs:
 *
 *   - name: Unique identifier (snake_case recommended)
 *   - description: What the tool does (shown to AI)
 *   - inputSchema: JSON Schema defining accepted parameters
 *
 * ───────────────────────────────────────────────────────────────────────────
 * BEST PRACTICES FOR TOOL DEFINITIONS
 * ───────────────────────────────────────────────────────────────────────────
 *
 * 1. NAME: Use verb_noun format
 *    - Good: search_statutes, get_article, list_regulations
 *    - Bad: statute_search, articleGetter, regulations
 *
 * 2. DESCRIPTION: Be specific and include examples
 *    - Good: "Search Swedish statutes by keyword. Supports boolean
 *            operators (AND, OR, NOT) and phrase search with quotes."
 *    - Bad: "Searches stuff"
 *
 * 3. PARAMETERS: Include detailed descriptions
 *    - Explain valid values and formats
 *    - Mention defaults for optional parameters
 *    - Use enums where possible to constrain values
 *
 * 4. REQUIRED: Only mark truly required parameters
 *    - Tool should work with minimal input
 *    - Provide sensible defaults for everything else
 *
 * ───────────────────────────────────────────────────────────────────────────
 */
const TOOLS: Tool[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // SEARCH TOOL
  // ─────────────────────────────────────────────────────────────────────────
  // The primary discovery tool. Users typically start here.
  {
    name: 'search_content',
    description: `Full-text search across all content.

Supports:
- Simple keywords: "data protection"
- Boolean operators: data AND protection, data OR security, data NOT personal
- Phrase search: "personal data breach"
- Prefix matching: cyber* (matches cybersecurity, cyberattack, etc.)

Results are ranked by relevance using BM25 algorithm.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (supports boolean operators and phrases)',
        },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific sources (e.g., ["GDPR", "NIS2"]). Omit to search all.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10, max: 50)',
        },
      },
      required: ['query'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GET ITEM TOOL
  // ─────────────────────────────────────────────────────────────────────────
  // For retrieving specific items when the user knows what they want.
  {
    name: 'get_item',
    description: `Retrieve a specific item by its identifier.

Returns full text content along with metadata like:
- Title and parent (chapter/section)
- Related items (cross-references)
- Effective dates and amendments

Use list_sources first to see available sources and their item formats.`,
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source identifier (e.g., "GDPR", "NIS2")',
        },
        item_id: {
          type: 'string',
          description: 'Item identifier within the source (e.g., "25" for Article 25)',
        },
        include_related: {
          type: 'boolean',
          description: 'Include cross-referenced items in response (default: false)',
        },
      },
      required: ['source', 'item_id'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LIST TOOL
  // ─────────────────────────────────────────────────────────────────────────
  // For browsing/discovering available content.
  {
    name: 'list_sources',
    description: `List available sources and their contents.

Without arguments: Returns all available sources with item counts.
With source: Returns detailed structure (chapters, sections) of that source.

Use this to discover what data is available before searching or retrieving.`,
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source to list items from. Omit to list all sources.',
        },
        parent: {
          type: 'string',
          description: 'Filter to items under this parent (e.g., chapter name)',
        },
      },
      required: [],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DEFINITIONS TOOL
  // ─────────────────────────────────────────────────────────────────────────
  // For looking up official terminology.
  {
    name: 'lookup_definition',
    description: `Look up the official definition of a term.

Searches for terms that match (partial matching supported).
Returns the definition and which item defines it.

Example: lookup_definition("personal data") returns GDPR's definition.`,
    inputSchema: {
      type: 'object',
      properties: {
        term: {
          type: 'string',
          description: 'Term to look up (partial matching supported)',
        },
        source: {
          type: 'string',
          description: 'Limit search to specific source (optional)',
        },
      },
      required: ['term'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ADD MORE TOOLS HERE
  // ─────────────────────────────────────────────────────────────────────────
  // Common additional tools to consider:
  //
  // - compare_requirements: Compare requirements across sources
  // - check_applicability: Does source X apply to entity Y?
  // - map_to_framework: Map to ISO 27001, NIST, etc.
  // - get_timeline: Get implementation timeline/deadlines
  // - find_related: Find related items across sources
  // ─────────────────────────────────────────────────────────────────────────
];

// ═══════════════════════════════════════════════════════════════════════════
// SERVER SETUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create and configure the MCP server
 *
 * The server instance handles the MCP protocol, including:
 *   - Capability negotiation
 *   - Request/response handling
 *   - Error management
 */
const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      // Declare that this server provides tools
      tools: {},

      // Other capabilities (uncomment if needed):
      // resources: {},     // For file/data resources
      // prompts: {},       // For prompt templates
    },
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ListTools Handler
 *
 * Called when the AI assistant wants to know what tools are available.
 * Returns the TOOLS array defined above.
 *
 * This is called:
 *   - When a session starts
 *   - When the assistant needs to refresh its tool list
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error(`[${SERVER_NAME}] ListTools request received`);
  return { tools: TOOLS };
});

/**
 * CallTool Handler
 *
 * Called when the AI assistant wants to execute a tool.
 * Routes to the appropriate tool function based on name.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RESPONSE FORMAT
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Successful response:
 *   {
 *     content: [{ type: 'text', text: JSON.stringify(result) }]
 *   }
 *
 * Error response:
 *   {
 *     content: [{ type: 'text', text: 'Error: message' }],
 *     isError: true
 *   }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERROR HANDLING STRATEGY
 * ───────────────────────────────────────────────────────────────────────────
 *
 * - Unknown tool: Return error with isError: true
 * - Invalid input: Let tool validate and return appropriate error
 * - Not found: Return null or empty array (not an error)
 * - Database error: Catch and return with isError: true
 *
 * ───────────────────────────────────────────────────────────────────────────
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[${SERVER_NAME}] CallTool: ${name}`);
  console.error(`[${SERVER_NAME}] Arguments: ${JSON.stringify(args)}`);

  try {
    let result: unknown;

    // ─────────────────────────────────────────────────────────────────────
    // TOOL ROUTING
    // ─────────────────────────────────────────────────────────────────────
    // Add a case for each tool defined in TOOLS.
    // Cast arguments to the appropriate input type.
    // ─────────────────────────────────────────────────────────────────────

    switch (name) {
      case 'search_content':
        result = await searchContent(getDb(), args as SearchInput);
        break;

      case 'get_item':
        result = await getItem(getDb(), args as GetItemInput);
        break;

      case 'list_sources':
        result = await listSources(getDb(), args as ListInput);
        break;

      case 'lookup_definition':
        result = await lookupDefinition(getDb(), args as DefinitionInput);
        break;

      // ─────────────────────────────────────────────────────────────────
      // ADD MORE TOOL CASES HERE
      // ─────────────────────────────────────────────────────────────────

      default:
        // Unknown tool - return error
        console.error(`[${SERVER_NAME}] Unknown tool: ${name}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: Unknown tool "${name}". Use ListTools to see available tools.`,
            },
          ],
          isError: true,
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // FORMAT SUCCESSFUL RESPONSE
    // ─────────────────────────────────────────────────────────────────────
    // JSON.stringify with indentation for readability.
    // The AI assistant will parse this JSON.
    // ─────────────────────────────────────────────────────────────────────

    console.error(`[${SERVER_NAME}] Tool ${name} completed successfully`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────
    // HANDLE ERRORS
    // ─────────────────────────────────────────────────────────────────────
    // Log the full error for debugging, return message to AI.
    // ─────────────────────────────────────────────────────────────────────

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${SERVER_NAME}] Tool ${name} failed: ${errorMessage}`);

    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main function
 *
 * Sets up the stdio transport and starts the server.
 * Handles graceful shutdown on process termination.
 */
async function main(): Promise<void> {
  console.error(`[${SERVER_NAME}] Starting server v${SERVER_VERSION}...`);

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE TRANSPORT
  // ─────────────────────────────────────────────────────────────────────────
  // The stdio transport communicates via stdin/stdout.
  // This is the standard transport for local MCP servers.
  //
  // For network transport (HTTP/SSE), use:
  //   import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
  // ─────────────────────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();

  // ─────────────────────────────────────────────────────────────────────────
  // GRACEFUL SHUTDOWN
  // ─────────────────────────────────────────────────────────────────────────
  // Handle termination signals to clean up resources.
  // Important for releasing database connections.
  // ─────────────────────────────────────────────────────────────────────────

  process.on('SIGINT', () => {
    console.error(`[${SERVER_NAME}] Received SIGINT, shutting down...`);
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error(`[${SERVER_NAME}] Received SIGTERM, shutting down...`);
    closeDb();
    process.exit(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONNECT AND RUN
  // ─────────────────────────────────────────────────────────────────────────
  // Connect the server to the transport and start processing messages.
  // This call blocks until the transport closes.
  // ─────────────────────────────────────────────────────────────────────────

  await server.connect(transport);

  console.error(`[${SERVER_NAME}] Server started successfully`);
  console.error(`[${SERVER_NAME}] Waiting for MCP client connection...`);
}

// Run the server
main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  closeDb();
  process.exit(1);
});
