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
import {
  getArticleHistory,
  type GetArticleHistoryInput,
  diffArticle,
  type DiffArticleInput,
  getRecentChanges,
  type GetRecentChangesInput,
} from './version-tracking.js';
import { getRegulationGuide, type RegulationGuideInput } from './regulation-guide.js';
import {
  searchGuidance,
  type SearchGuidanceInput,
  getGuidanceSection,
  type GetGuidanceSectionInput,
  listGuidance,
  type ListGuidanceInput,
} from './guidance.js';
import { listSources } from './list-sources.js';
import { checkDataFreshness } from './freshness.js';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  annotations?: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
  };
  handler: (db: DatabaseAdapter, args: any) => Promise<any>;
}


const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
} as const;

function toTitle(name: string): string {
  return name
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function annotateTools(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map((tool) => ({
    ...tool,
    annotations: tool.annotations ?? {
      title: toTitle(tool.name),
      readOnlyHint: READ_ONLY_ANNOTATIONS.readOnlyHint,
      destructiveHint: READ_ONLY_ANNOTATIONS.destructiveHint,
    },
  }));
}

/**
 * Centralized registry of all MCP tools.
 * Single source of truth for both stdio and HTTP servers.
 */
export const TOOLS: ToolDefinition[] = [
  {
    name: 'search_regulations',
    description: 'Search across all EU regulations for articles matching a query. Returns relevant articles with snippets highlighting matches. Token-efficient: returns 64-token snippets per match (safe for context).',
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
        include_recitals: {
          type: 'boolean',
          description: 'Optional: include related recitals alongside the article text (default: false)',
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
    description: 'List available regulations, optionally filtered by category. Without parameters, lists all regulations grouped by category. With a regulation specified, shows chapters and articles.',
    inputSchema: {
      type: 'object',
      properties: {
        regulation: {
          type: 'string',
          description: 'Optional: specific regulation to get detailed structure for',
        },
        category: {
          type: 'string',
          description: 'Optional: filter by category (e.g., "cybersecurity", "financial_services", "data_protection", "ai_and_technology", "product_safety", "sustainability", "healthcare", "critical_infrastructure", "digital_services", "automotive")',
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
          description: 'Optional: specific control ID (e.g., "A.5.1" for ISO27001, "PR.AA-01" for NIST CSF 2.0)',
        },
        regulation: {
          type: 'string',
          description: 'Optional: filter mappings to specific regulation',
        },
        limit: {
          type: 'number',
          description: 'Maximum control groups to return (default: 100)',
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
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 50)',
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
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 50)',
        },
      },
    },
    handler: async (db, args) => {
      const input = args as unknown as EvidenceInput;
      return await getEvidenceRequirements(db, input);
    },
  },
  {
    name: 'get_regulation_guide',
    description:
      'Get analysis guidance for a specific regulation. Returns delegated acts, ' +
      'proportionality tiers, commonly missed provisions, cross-regulation pointers, and ' +
      'analysis methodology hints. Call this BEFORE analyzing any regulation to discover ' +
      'what data is available and how to use it effectively.',
    inputSchema: {
      type: 'object',
      properties: {
        regulation: {
          type: 'string',
          description: 'Regulation ID (e.g., "DORA", "GDPR", "NIS2", "AI_ACT")',
        },
        detail_level: {
          type: 'string',
          enum: ['quick', 'full'],
          description:
            'Quick (~500 tokens): delegated acts, proportionality, top pitfalls, ' +
            'cross-regulation. Full (~1500 tokens): adds key article structures, evidence ' +
            'hints, recitals, national law pointers. Default: quick.',
        },
      },
      required: ['regulation'],
    },
    handler: async (_db, args) => {
      const input = args as unknown as RegulationGuideInput;
      return getRegulationGuide(input);
    },
  },
  // --- Version tracking tools ---
  {
    name: 'get_article_history',
    description:
      'Get the full version timeline for a specific article, showing all amendments with dates and change summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        regulation: {
          type: 'string',
          description: 'Regulation ID (e.g., "NIS2", "DORA", "GDPR")',
        },
        article: {
          type: 'string',
          description: 'Article number (e.g., "21", "6")',
        },
      },
      required: ['regulation', 'article'],
    },
    handler: async (db, args) => {
      const input = args as unknown as GetArticleHistoryInput;
      return await getArticleHistory(db, input);
    },
  },
  {
    name: 'diff_article',
    description:
      'Show what changed in a specific article between two dates, including a unified diff and AI-generated change summary.',
    inputSchema: {
      type: 'object',
      properties: {
        regulation: {
          type: 'string',
          description: 'Regulation ID (e.g., "NIS2", "DORA", "GDPR")',
        },
        article: {
          type: 'string',
          description: 'Article number (e.g., "21", "6")',
        },
        from_date: {
          type: 'string',
          description: 'ISO date to diff from (e.g., "2024-01-01")',
        },
        to_date: {
          type: 'string',
          description: 'ISO date to diff to (defaults to today)',
        },
      },
      required: ['regulation', 'article', 'from_date'],
    },
    handler: async (db, args) => {
      const input = args as unknown as DiffArticleInput;
      return await diffArticle(db, input);
    },
  },
  {
    name: 'get_recent_changes',
    description:
      'List all articles that changed since a given date, with change summaries. Optionally filter to a specific regulation.',
    inputSchema: {
      type: 'object',
      properties: {
        regulation: {
          type: 'string',
          description: 'Optional: filter to a specific regulation (e.g., "NIS2")',
        },
        since: {
          type: 'string',
          description: 'ISO date (e.g., "2024-06-01")',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 50, max: 200)',
        },
      },
      required: ['since'],
    },
    handler: async (db, args) => {
      const input = args as unknown as GetRecentChangesInput;
      return await getRecentChanges(db, input);
    },
  },
  // --- Guidance document tools (MDCG, EDPB, etc.) ---
  {
    name: 'search_guidance',
    description:
      'Search across EU guidance documents (MDCG medical device guidance, EDPB data protection guidance, etc.) for sections matching a query. Returns relevant sections with snippets. Use this for non-binding guidance that interprets or supplements EU regulations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "cybersecurity risk management", "SaMD classification")',
        },
        document_id: {
          type: 'string',
          description: 'Optional: filter to a specific document (e.g., "MDCG_2019_16")',
        },
        issuing_body: {
          type: 'string',
          description: 'Optional: filter by issuing body (e.g., "MDCG", "EDPB")',
        },
        related_regulation: {
          type: 'string',
          description: 'Optional: filter by related regulation (e.g., "MDR", "IVDR", "GDPR")',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 15)',
        },
      },
      required: ['query'],
    },
    handler: async (db, args) => {
      const input = args as unknown as SearchGuidanceInput;
      return await searchGuidance(db, input);
    },
  },
  {
    name: 'get_guidance_section',
    description:
      'Retrieve the full text of a specific section from a guidance document. Use after search_guidance to get the complete section content.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Guidance document ID (e.g., "MDCG_2019_16")',
        },
        section_number: {
          type: 'string',
          description: 'Section number (e.g., "3", "3.1")',
        },
      },
      required: ['document_id', 'section_number'],
    },
    handler: async (db, args) => {
      const input = args as unknown as GetGuidanceSectionInput;
      const section = await getGuidanceSection(db, input);
      if (!section) {
        throw new Error(
          `Section ${input.section_number} not found in document ${input.document_id}`,
        );
      }
      return section;
    },
  },
  {
    name: 'list_guidance',
    description:
      'List available guidance documents, optionally filtered by issuing body or related regulation. Shows document titles, references, dates, and section counts.',
    inputSchema: {
      type: 'object',
      properties: {
        issuing_body: {
          type: 'string',
          description: 'Optional: filter by issuing body (e.g., "MDCG", "EDPB")',
        },
        related_regulation: {
          type: 'string',
          description: 'Optional: filter by related regulation (e.g., "MDR", "IVDR")',
        },
      },
    },
    handler: async (db, args) => {
      const input = (args ?? {}) as unknown as ListGuidanceInput;
      return await listGuidance(db, input);
    },
  },
  {
    name: 'list_sources',
    description:
      'List all data sources used by this MCP server, including their licenses, content types, ' +
      'and coverage. Use this to understand data provenance before relying on results for legal purposes.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async (_db, _args) => {
      return listSources();
    },
  },
  {
    name: 'check_data_freshness',
    description:
      'Check when regulation data was last updated against EUR-Lex. Returns per-source freshness ' +
      'timestamps and the update check method. Use this to assess data currency before time-sensitive analysis.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async (db, _args) => {
      return await checkDataFreshness(db);
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
  const allTools = annotateTools(context ? buildTools(context) : TOOLS);
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
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

      // ``_citation`` is dual-emitted: once inside the ``content[0].text`` JSON
      // (so downstream consumers that only inspect the parsed content see it —
      // e.g. the MCP Gateway's fanout reads ``content``, not CallToolResult
      // ``_meta``) and once at the protocol-level ``_meta`` (so the Watchdog
      // and grounding-enforcement systems that read ``CallToolResult._meta``
      // see it too; that's the path introduced in commit 0ff2dd4). Stripping
      // from content broke the gateway — the 2026-04-20 validate_citation
      // probe against gateway.ansvar.eu showed ``citation.source_url == ""``
      // because the gateway could never read the ``_citation`` envelope.
      let _citation: Record<string, unknown> | undefined;
      if (result && typeof result === 'object' && !Array.isArray(result) && result._citation) {
        _citation = result._citation;
      }

      const _meta: Record<string, unknown> = {
        disclaimer:
          'Content is derived from EUR-Lex official texts and is not an official legal publication. ' +
          'Only documents published in the Official Journal of the EU are legally authentic (Article 297 TFEU).',
        copyright:
          'EUR-Lex content reusable under EUR-Lex reuse policy (CC BY 4.0). Server code: Apache-2.0.',
        source_url: 'https://eur-lex.europa.eu',
        data_age: new Date().toISOString().split('T')[0],
        ..._citation ? { _citation } : {},
      };

      const textPayload =
        typeof result === 'string'
          ? result
          : Array.isArray(result)
          ? { data: result }
          : result && typeof result === 'object'
          ? result
          : { data: result };

      return {
        _meta,
        content: [
          {
            type: 'text',
            text: typeof textPayload === 'string' ? textPayload : JSON.stringify(textPayload, null, 2),
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
