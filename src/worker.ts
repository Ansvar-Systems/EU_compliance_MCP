/**
 * Cloudflare Worker - EU Regulations HTTP API
 *
 * This is a simplified HTTP API wrapper for direct client access (ChatGPT, GitHub Copilot).
 * It does NOT implement the full MCP protocol - it provides a REST-style endpoint for tool execution.
 *
 * Architecture:
 * - POST /api/tool - Execute a tool by name with parameters (see API contract below)
 * - GET /tools - List available tools with their schemas (for discovery)
 * - GET /health - Health check endpoint
 * - GET / - API documentation and usage examples
 *
 * This design choice was made for simplicity over protocol compliance, targeting AI assistants
 * that need direct HTTP access rather than MCP protocol support.
 *
 * API Contract:
 * POST /api/tool
 * Request: { "tool": "tool_name", "params": { ...tool-specific params } }
 * Response: { "result": { ...tool result }, "timestamp": "ISO8601" }
 * Error: { "error": "error_type", "message": "details" }
 *
 * Features:
 * - PostgreSQL database adapter (Neon serverless)
 * - IP-based rate limiting (100 req/hour default)
 * - CORS support for ChatGPT/Copilot origins
 * - Rate limit headers (X-RateLimit-*)
 *
 * Environment variables:
 * - DATABASE_URL: PostgreSQL connection string (required)
 * - RATE_LIMIT_MAX_REQUESTS: Max requests per window (default: 100)
 * - RATE_LIMIT_WINDOW_MS: Rate limit window in ms (default: 3600000 = 1 hour)
 */

import { createPostgresAdapter } from './database/postgres-adapter.js';
import { RateLimiter } from './middleware/rate-limit.js';
import type { DatabaseAdapter } from './database/types.js';

// Import tool registry (single source of truth for tools)
import { TOOLS } from './tools/registry.js';

// Import tool handlers
import { searchRegulations } from './tools/search.js';
import { getArticle } from './tools/article.js';
import { getRecital } from './tools/recital.js';
import { listRegulations } from './tools/list.js';
import { compareRequirements } from './tools/compare.js';
import { mapControls } from './tools/map.js';
import { checkApplicability } from './tools/applicability.js';
import { getDefinitions } from './tools/definitions.js';
import { getEvidenceRequirements } from './tools/evidence.js';

interface Env {
  DATABASE_URL: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
  RATE_LIMIT_WINDOW_MS?: string;
}

// Global instances (initialized on first request)
let db: DatabaseAdapter | null = null;
let rateLimiter: RateLimiter | null = null;

/**
 * Initialize database connection (lazy, cached)
 */
async function getDatabase(env: Env): Promise<DatabaseAdapter> {
  if (!db) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    db = await createPostgresAdapter(env.DATABASE_URL);
  }
  return db;
}

/**
 * Initialize rate limiter (lazy, cached)
 */
function getRateLimiter(env: Env): RateLimiter {
  if (!rateLimiter) {
    const maxRequests = parseInt(env.RATE_LIMIT_MAX_REQUESTS || '100');
    const windowMs = parseInt(env.RATE_LIMIT_WINDOW_MS || '3600000');
    rateLimiter = new RateLimiter(maxRequests, windowMs);
  }
  return rateLimiter;
}

/**
 * Extract client IP from Cloudflare headers.
 * Used for rate limiting by IP address.
 */
function getClientIP(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
    '0.0.0.0'
  );
}

/**
 * Generate CORS headers for ChatGPT/Copilot access.
 * Only allows requests from approved AI assistant origins.
 *
 * @param origin - The Origin header from the request
 * @returns CORS headers for the response
 */
function corsHeaders(origin?: string): HeadersInit {
  const allowedOrigins = [
    'https://chat.openai.com',
    'https://chatgpt.com',
    'https://copilot.microsoft.com',
    'https://github.com',
  ];

  const allowOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * List available tools endpoint.
 * Returns all tools with their schemas for discovery.
 *
 * GET /tools
 * Response: { "tools": [{ "name": "...", "description": "...", "inputSchema": {...} }] }
 */
function handleListTools(): Response {
  return new Response(
    JSON.stringify({
      tools: TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
      count: TOOLS.length,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    }
  );
}

/**
 * Health check endpoint.
 * Tests database connectivity and returns server status.
 *
 * GET /health
 * Response: { "status": "healthy|unhealthy", "database": "connected|error", ... }
 */
async function handleHealthCheck(env: Env): Promise<Response> {
  try {
    const database = await getDatabase(env);

    // Test database connection
    await database.query('SELECT 1');

    return new Response(
      JSON.stringify({
        status: 'healthy',
        server: 'eu-regulations-mcp',
        version: '0.6.5',
        database: 'connected',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      }
    );
  }
}

/**
 * Generate rate limit exceeded response.
 * Returns 429 status with retry information.
 *
 * @param resetAt - Timestamp when rate limit resets
 * @returns 429 response with retry headers
 */
function rateLimitResponse(resetAt: number): Response {
  const resetDate = new Date(resetAt);

  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
      resetAt: resetDate.toISOString(),
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil((resetAt - Date.now()) / 1000).toString(),
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': resetDate.toISOString(),
        ...corsHeaders(),
      },
    }
  );
}

/**
 * Handle API tool execution endpoint.
 *
 * POST /api/tool
 * Request body: { "tool": "tool_name", "params": { ...tool-specific parameters } }
 * Success response: { "result": { ...tool output }, "timestamp": "ISO8601" }
 * Error response: { "error": "error_type", "message": "details" }
 *
 * @param request - The incoming HTTP request
 * @param env - Cloudflare Worker environment
 * @returns Response with tool result or error
 */
async function handleToolCall(
  request: Request,
  env: Env
): Promise<Response> {
  const limiter = getRateLimiter(env);
  const clientIP = getClientIP(request);

  // Check rate limit
  const rateLimitInfo = limiter.getRateLimitInfo(clientIP);
  if (!rateLimitInfo.allowed) {
    return rateLimitResponse(rateLimitInfo.resetAt);
  }

  try {
    const database = await getDatabase(env);
    const body = (await request.json()) as any;

    let result: any;

    // Route to appropriate tool handler
    switch (body.tool) {
      case 'search_regulations':
        result = await searchRegulations(database, body.params);
        break;
      case 'get_article':
        result = await getArticle(database, body.params);
        break;
      case 'get_recital':
        result = await getRecital(database, body.params);
        break;
      case 'list_regulations':
        result = await listRegulations(database, body.params || {});
        break;
      case 'compare_requirements':
        result = await compareRequirements(database, body.params);
        break;
      case 'map_controls':
        result = await mapControls(database, body.params);
        break;
      case 'check_applicability':
        result = await checkApplicability(database, body.params);
        break;
      case 'get_definitions':
        result = await getDefinitions(database, body.params);
        break;
      case 'get_evidence_requirements':
        result = await getEvidenceRequirements(database, body.params);
        break;
      default:
        return new Response(
          JSON.stringify({
            error: 'Unknown tool',
            message: `Tool '${body.tool}' not found`,
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': limiter['maxRequests'].toString(),
              'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
              'X-RateLimit-Reset': new Date(rateLimitInfo.resetAt).toISOString(),
              ...corsHeaders(request.headers.get('Origin') || undefined),
            },
          }
        );
    }

    // Return successful response
    return new Response(
      JSON.stringify({
        result,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': limiter['maxRequests'].toString(),
          'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
          'X-RateLimit-Reset': new Date(rateLimitInfo.resetAt).toISOString(),
          ...corsHeaders(request.headers.get('Origin') || undefined),
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(request.headers.get('Origin') || undefined),
        },
      }
    );
  }
}

/**
 * Main fetch handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get('Origin') || undefined),
      });
    }

    // Route handling
    switch (url.pathname) {
      case '/health':
        return handleHealthCheck(env);

      case '/tools':
        if (request.method !== 'GET') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            {
              status: 405,
              headers: {
                'Content-Type': 'application/json',
                Allow: 'GET',
                ...corsHeaders(),
              },
            }
          );
        }
        return handleListTools();

      case '/api/tool':
        if (request.method !== 'POST') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            {
              status: 405,
              headers: {
                'Content-Type': 'application/json',
                Allow: 'POST',
                ...corsHeaders(),
              },
            }
          );
        }
        return handleToolCall(request, env);

      case '/':
        return new Response(
          JSON.stringify({
            server: 'eu-regulations-mcp',
            version: '0.6.5',
            description: 'HTTP API for EU cybersecurity regulations (ChatGPT/Copilot compatible)',
            endpoints: {
              '/': 'API documentation (this page)',
              '/health': 'Health check (GET)',
              '/tools': 'List available tools with schemas (GET)',
              '/api/tool': 'Execute a tool (POST)',
            },
            documentation:
              'https://github.com/Ansvar-Systems/EU_compliance_MCP',
            usage: {
              discovery: {
                description: 'Get list of available tools',
                method: 'GET',
                url: '/tools',
                response: {
                  tools: '[array of tools with name, description, inputSchema]',
                  count: 9,
                },
              },
              execution: {
                description: 'Execute a tool',
                method: 'POST',
                url: '/api/tool',
                body: {
                  tool: 'search_regulations',
                  params: {
                    query: 'incident reporting',
                    limit: 10,
                  },
                },
                response: {
                  result: '[tool-specific output]',
                  timestamp: 'ISO8601',
                },
              },
            },
            rateLimits: {
              requests: '100 per hour per IP',
              headers: 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(),
            },
          }
        );

      default:
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(),
          },
        });
    }
  },

  /**
   * Cleanup handler (called when worker is terminated)
   */
  async cleanup() {
    if (db) {
      await db.close();
    }
  },
};
