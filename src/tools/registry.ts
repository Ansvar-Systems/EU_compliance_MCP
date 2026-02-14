import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { DatabaseAdapter } from '../database/types.js';

import { searchRegulations, type SearchInput } from './search.js';
import { getArticle, type GetArticleInput } from './article.js';
import { getRecital, type GetRecitalInput } from './recital.js';
import { listRegulations, type ListInput } from './list.js';
import { compareRequirements, type CompareInput } from './compare.js';
import { mapControls, type MapControlsInput } from './map.js';
import { checkApplicability, type ApplicabilityInput } from './applicability.js';
import { getDefinitions, type DefinitionsInput } from './definitions.js';
import { getEvidenceRequirements, type EvidenceInput } from './evidence.js';
import { getAbout, type AboutContext } from './about.js';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  handler: (db: DatabaseAdapter, args: any) => Promise<any>;
}

/**
 * Centralized registry of all MCP tools.
 * Single source of truth for both stdio and HTTP servers.
 */
export const TOOLS: ToolDefinition[] = [
  {
    name: 'search_regulations',
    description: 'Search across all EU regulations for articles matching a query. Returns relevant articles with snippets highlighting matches. Token-efficient: returns 32-token snippets per match (safe for context).',
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
    handler: async (db, args) => {
      const input = args as unknown as SearchInput;
      return await searchRegulations(db, input);
    },
  },
  {
    name: 'get_article',
    description: 'Retrieve the full text of a specific article from a regulation. WARNING: Token usage varies (500-70,000 tokens per article). Large articles are automatically truncated at 50,000 characters (~12,500 tokens) with a notice. Use search_regulations first to find relevant articles.',
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
    handler: async (db, args) => {
      const input = args as unknown as GetArticleInput;
      const article = await getArticle(db, input);
      if (!article) {
        throw new Error(`Article ${input.article} not found in ${input.regulation}`);
      }
      return article;
    },
  },
  {
    name: 'get_recital',
    description: 'Retrieve the full text of a specific recital from a regulation. Recitals provide context and interpretation guidance for articles.',
    inputSchema: {
      type: 'object',
      properties: {
        regulation: {
          type: 'string',
          description: 'Regulation ID (e.g., "GDPR", "NIS2", "DORA")',
        },
        recital_number: {
          type: 'number',
          description: 'Recital number (e.g., 1, 83)',
        },
      },
      required: ['regulation', 'recital_number'],
    },
    handler: async (db, args) => {
      const input = args as unknown as GetRecitalInput;
      const recital = await getRecital(db, input);
      if (!recital) {
        throw new Error(`Recital ${input.recital_number} not found in ${input.regulation}`);
      }
      return recital;
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
    handler: async (db, args) => {
      const input = (args ?? {}) as unknown as ListInput;
      return await listRegulations(db, input);
    },
  },
  {
    name: 'compare_requirements',
    description: 'Search and compare articles across multiple regulations on a specific topic. Returns matching articles from each regulation with text snippets showing how they address the topic. Uses full-text search with relevance ranking to find related requirements.',
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
    handler: async (db, args) => {
      const input = args as unknown as CompareInput;
      return await compareRequirements(db, input);
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
    handler: async (db, args) => {
      const input = args as unknown as MapControlsInput;
      return await mapControls(db, input);
    },
  },
  {
    name: 'check_applicability',
    description: 'Determine which EU regulations apply to an organization based on sector and characteristics. Supports tiered detail levels for optimal response length.',
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
        detail_level: {
          type: 'string',
          enum: ['summary', 'requirements', 'full'],
          description: 'Optional: level of detail (summary=executive overview only, requirements=include key requirements, full=complete details with basis articles). Default: full',
        },
      },
      required: ['sector'],
    },
    handler: async (db, args) => {
      const input = args as unknown as ApplicabilityInput;
      return await checkApplicability(db, input);
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
    handler: async (db, args) => {
      const input = args as unknown as DefinitionsInput;
      return await getDefinitions(db, input);
    },
  },
  {
    name: 'get_evidence_requirements',
    description: 'Get compliance evidence and audit artifacts required for specific regulation requirements. Shows what documents, logs, and test results auditors will ask for, including retention periods and maturity levels.',
    inputSchema: {
      type: 'object',
      properties: {
        regulation: {
          type: 'string',
          description: 'Optional: filter to specific regulation (e.g., "DORA", "GDPR")',
        },
        article: {
          type: 'string',
          description: 'Optional: filter to specific article (e.g., "6", "32")',
        },
        evidence_type: {
          type: 'string',
          enum: ['document', 'log', 'test_result', 'certification', 'policy', 'procedure'],
          description: 'Optional: filter by evidence type',
        },
      },
    },
    handler: async (db, args) => {
      const input = args as unknown as EvidenceInput;
      return await getEvidenceRequirements(db, input);
    },
  },
];

/**
 * Create the about tool with captured startup context.
 * Uses a closure so the handler signature stays compatible with ToolDefinition.
 */
function createAboutTool(context: AboutContext): ToolDefinition {
  return {
    name: 'about',
    description:
      'Server metadata, dataset statistics, freshness, and provenance. ' +
      'Call this to verify data coverage, currency, and content basis before relying on results.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async (db) => {
      return await getAbout(db, context);
    },
  };
}

/**
 * Build the full tools list including context-dependent tools.
 */
export function buildTools(context: AboutContext): ToolDefinition[] {
  return [...TOOLS, createAboutTool(context)];
}

/**
 * Register all tools with an MCP server instance.
 * Use this for both stdio and HTTP servers to ensure parity.
 */
export function registerTools(server: Server, db: DatabaseAdapter, context?: AboutContext): void {
  const allTools = context ? buildTools(context) : TOOLS;
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = allTools.find(t => t.name === name);

    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await tool.handler(db, args || {});
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });
}
