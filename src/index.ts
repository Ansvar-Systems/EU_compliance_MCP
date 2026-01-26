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

import { searchRegulations, type SearchInput } from './tools/search.js';
import { getArticle, type GetArticleInput } from './tools/article.js';
import { listRegulations, type ListInput } from './tools/list.js';
import { compareRequirements, type CompareInput } from './tools/compare.js';
import { mapControls, type MapControlsInput } from './tools/map.js';
import { checkApplicability, type ApplicabilityInput } from './tools/applicability.js';
import { getDefinitions, type DefinitionsInput } from './tools/definitions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path - look for regulations.db in data folder
const DB_PATH = process.env.EU_COMPLIANCE_DB_PATH || join(__dirname, '..', 'data', 'regulations.db');

let db: Database.Database;

function getDatabase(): Database.Database {
  if (!db) {
    try {
      db = new Database(DB_PATH, { readonly: true });
    } catch (error) {
      throw new Error(`Failed to open database at ${DB_PATH}: ${error}`);
    }
  }
  return db;
}

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

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_regulations',
      description: 'Search across all EU regulations for articles matching a query. Returns relevant articles with snippets highlighting matches.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (e.g., "incident reporting", "personal data breach")',
          },
          regulations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: filter to specific regulations (e.g., ["GDPR", "NIS2"])',
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return (default: 10)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_article',
      description: 'Retrieve the full text of a specific article from a regulation.',
      inputSchema: {
        type: 'object',
        properties: {
          regulation: {
            type: 'string',
            description: 'Regulation ID (e.g., "GDPR", "NIS2", "DORA")',
          },
          article: {
            type: 'string',
            description: 'Article number (e.g., "17", "23")',
          },
        },
        required: ['regulation', 'article'],
      },
    },
    {
      name: 'list_regulations',
      description: 'List available regulations and their structure. Without parameters, lists all regulations. With a regulation specified, shows chapters and articles.',
      inputSchema: {
        type: 'object',
        properties: {
          regulation: {
            type: 'string',
            description: 'Optional: specific regulation to get detailed structure for',
          },
        },
      },
    },
    {
      name: 'compare_requirements',
      description: 'Compare requirements across multiple regulations on a specific topic. Useful for understanding differences in how regulations address similar concerns.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Topic to compare (e.g., "incident reporting", "risk assessment")',
          },
          regulations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Regulations to compare (e.g., ["DORA", "NIS2"])',
          },
        },
        required: ['topic', 'regulations'],
      },
    },
    {
      name: 'map_controls',
      description: 'Map security framework controls to EU regulation requirements. Shows which articles satisfy specific security controls.',
      inputSchema: {
        type: 'object',
        properties: {
          framework: {
            type: 'string',
            enum: ['ISO27001', 'NIST_CSF'],
            description: 'Control framework: ISO27001 (ISO 27001:2022) or NIST_CSF (NIST Cybersecurity Framework)',
          },
          control: {
            type: 'string',
            description: 'Optional: specific control ID (e.g., "A.5.1" for ISO27001, "PR.AC-1" for NIST CSF)',
          },
          regulation: {
            type: 'string',
            description: 'Optional: filter mappings to specific regulation',
          },
        },
        required: ['framework'],
      },
    },
    {
      name: 'check_applicability',
      description: 'Determine which EU regulations apply to an organization based on sector and characteristics.',
      inputSchema: {
        type: 'object',
        properties: {
          sector: {
            type: 'string',
            enum: ['financial', 'healthcare', 'energy', 'transport', 'digital_infrastructure', 'public_administration', 'manufacturing', 'other'],
            description: 'Organization sector',
          },
          subsector: {
            type: 'string',
            description: 'Optional: more specific subsector (e.g., "bank", "insurance" for financial)',
          },
          member_state: {
            type: 'string',
            description: 'Optional: EU member state (ISO country code)',
          },
          size: {
            type: 'string',
            enum: ['sme', 'large'],
            description: 'Optional: organization size',
          },
        },
        required: ['sector'],
      },
    },
    {
      name: 'get_definitions',
      description: 'Look up official definitions of terms from EU regulations. Terms are defined in each regulation\'s definitions article.',
      inputSchema: {
        type: 'object',
        properties: {
          term: {
            type: 'string',
            description: 'Term to look up (e.g., "personal data", "incident", "processing")',
          },
          regulation: {
            type: 'string',
            description: 'Optional: filter to specific regulation',
          },
        },
        required: ['term'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const database = getDatabase();

    switch (name) {
      case 'search_regulations': {
        const input = args as unknown as SearchInput;
        const results = await searchRegulations(database, input);
        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
        };
      }

      case 'get_article': {
        const input = args as unknown as GetArticleInput;
        const article = await getArticle(database, input);
        if (!article) {
          return {
            content: [{ type: 'text', text: `Article ${input.article} not found in ${input.regulation}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(article, null, 2) }],
        };
      }

      case 'list_regulations': {
        const input = (args ?? {}) as unknown as ListInput;
        const result = await listRegulations(database, input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'compare_requirements': {
        const input = args as unknown as CompareInput;
        const result = await compareRequirements(database, input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'map_controls': {
        const input = args as unknown as MapControlsInput;
        const result = await mapControls(database, input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'check_applicability': {
        const input = args as unknown as ApplicabilityInput;
        const result = await checkApplicability(database, input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_definitions': {
        const input = args as unknown as DefinitionsInput;
        const result = await getDefinitions(database, input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

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
