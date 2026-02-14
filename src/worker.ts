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
import { TOOLS, buildTools } from './tools/registry.js';

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
import { getAbout } from './tools/about.js';

// Worker about context (no filesystem access — uses static values)
const WORKER_VERSION = '1.0.0';
const WORKER_ABOUT_CONTEXT = {
  version: WORKER_VERSION,
  fingerprint: 'postgres',
  dbBuilt: 'live',
};

interface Env {
  DATABASE_URL: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  NODE_ENV?: string;
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
 * @returns CORS headers for the response, or null if origin is not allowed
 */
function corsHeaders(origin?: string): HeadersInit | null {
  const allowedOrigins = [
    'https://chat.openai.com',
    'https://chatgpt.com',
    'https://copilot.microsoft.com',
    'https://github.com',
  ];

  // If no origin or origin not in allowed list, return null
  if (!origin || !allowedOrigins.includes(origin)) {
    return null;
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Safely merge CORS headers, rejecting the request if origin is not allowed.
 * Used in responses that don't have access to request origin.
 *
 * @param baseHeaders - Base headers to merge with CORS headers
 * @param origin - The Origin header from the request
 * @returns Merged headers, or generates a 403 response if origin not allowed
 */
function mergeCorsHeaders(
  baseHeaders: HeadersInit,
  origin?: string
): HeadersInit | Response {
  const cors = corsHeaders(origin);

  if (!cors) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Origin not allowed',
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  return { ...baseHeaders, ...cors };
}

/**
 * List available tools endpoint.
 * Returns all tools with their schemas for discovery.
 *
 * GET /tools
 * Response: { "tools": [{ "name": "...", "description": "...", "inputSchema": {...} }] }
 */
function handleListTools(origin?: string): Response {
  const headers = mergeCorsHeaders(
    { 'Content-Type': 'application/json' },
    origin
  );

  if (headers instanceof Response) {
    return headers;
  }

  const allTools = buildTools(WORKER_ABOUT_CONTEXT);
  return new Response(
    JSON.stringify({
      tools: allTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
      count: allTools.length,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers,
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
async function handleHealthCheck(env: Env, origin?: string): Promise<Response> {
  const baseHeaders = { 'Content-Type': 'application/json' };
  const headers = mergeCorsHeaders(baseHeaders, origin);

  if (headers instanceof Response) {
    return headers;
  }

  try {
    const database = await getDatabase(env);

    // Test database connection
    await database.query('SELECT 1');

    return new Response(
      JSON.stringify({
        status: 'healthy',
        server: 'eu-regulations-mcp',
        version: WORKER_VERSION,
        database: 'connected',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers,
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
        headers,
      }
    );
  }
}

/**
 * Generate rate limit exceeded response.
 * Returns 429 status with retry information.
 *
 * @param resetAt - Timestamp when rate limit resets
 * @param limit - The actual rate limit
 * @param origin - The Origin header from the request
 * @returns 429 response with retry headers
 */
function rateLimitResponse(
  resetAt: number,
  limit: number,
  origin?: string
): Response {
  const resetDate = new Date(resetAt);
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Retry-After': Math.ceil((resetAt - Date.now()) / 1000).toString(),
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': resetDate.toISOString(),
  };

  const headers = mergeCorsHeaders(baseHeaders, origin);

  if (headers instanceof Response) {
    return headers;
  }

  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
      resetAt: resetDate.toISOString(),
    }),
    {
      status: 429,
      headers,
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
  const origin = request.headers.get('Origin') || undefined;

  // Check rate limit
  const rateLimitInfo = limiter.getRateLimitInfo(clientIP);
  if (!rateLimitInfo.allowed) {
    return rateLimitResponse(
      rateLimitInfo.resetAt,
      limiter['maxRequests'],
      origin
    );
  }

  // Check request size (max 100KB)
  const contentLength = request.headers.get('Content-Length');
  const maxSize = 100 * 1024; // 100KB
  if (contentLength && parseInt(contentLength) > maxSize) {
    const baseHeaders = {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': limiter['maxRequests'].toString(),
      'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
      'X-RateLimit-Reset': new Date(rateLimitInfo.resetAt).toISOString(),
    };
    const headers = mergeCorsHeaders(baseHeaders, origin);

    if (headers instanceof Response) {
      return headers;
    }

    return new Response(
      JSON.stringify({
        error: 'Payload too large',
        message: 'Request body must not exceed 100KB',
      }),
      {
        status: 413,
        headers,
      }
    );
  }

  try {
    const database = await getDatabase(env);
    const body = (await request.json()) as any;

    // Input validation
    if (!body || typeof body !== 'object') {
      const baseHeaders = {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': limiter['maxRequests'].toString(),
        'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimitInfo.resetAt).toISOString(),
      };
      const headers = mergeCorsHeaders(baseHeaders, origin);

      if (headers instanceof Response) {
        return headers;
      }

      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'Request body must be a JSON object',
        }),
        {
          status: 400,
          headers,
        }
      );
    }

    if (!body.tool || typeof body.tool !== 'string') {
      const baseHeaders = {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': limiter['maxRequests'].toString(),
        'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimitInfo.resetAt).toISOString(),
      };
      const headers = mergeCorsHeaders(baseHeaders, origin);

      if (headers instanceof Response) {
        return headers;
      }

      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'Missing or invalid "tool" field (must be a string)',
        }),
        {
          status: 400,
          headers,
        }
      );
    }

    if (body.params !== undefined && typeof body.params !== 'object') {
      const baseHeaders = {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': limiter['maxRequests'].toString(),
        'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimitInfo.resetAt).toISOString(),
      };
      const headers = mergeCorsHeaders(baseHeaders, origin);

      if (headers instanceof Response) {
        return headers;
      }

      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'Invalid "params" field (must be an object if provided)',
        }),
        {
          status: 400,
          headers,
        }
      );
    }

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
      case 'about':
        result = await getAbout(database, WORKER_ABOUT_CONTEXT);
        break;
      default:
        const baseHeaders = {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': limiter['maxRequests'].toString(),
          'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
          'X-RateLimit-Reset': new Date(rateLimitInfo.resetAt).toISOString(),
        };
        const headers = mergeCorsHeaders(baseHeaders, origin);

        if (headers instanceof Response) {
          return headers;
        }

        return new Response(
          JSON.stringify({
            error: 'Unknown tool',
            message: `Tool '${body.tool}' not found`,
          }),
          {
            status: 400,
            headers,
          }
        );
    }

    // Return successful response
    const successHeaders = {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': limiter['maxRequests'].toString(),
      'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
      'X-RateLimit-Reset': new Date(rateLimitInfo.resetAt).toISOString(),
    };
    const headers = mergeCorsHeaders(successHeaders, origin);

    if (headers instanceof Response) {
      return headers;
    }

    return new Response(
      JSON.stringify({
        result,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    // Log full error details for debugging
    console.error('Tool execution error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Sanitize error message for client
    const isDevelopment = env.NODE_ENV === 'development';
    const errorMessage = isDevelopment
      ? error instanceof Error
        ? error.message
        : 'Unknown error'
      : 'An error occurred while processing your request';

    const errorHeaders = {
      'Content-Type': 'application/json',
    };
    const headers = mergeCorsHeaders(errorHeaders, origin);

    if (headers instanceof Response) {
      return headers;
    }

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: errorMessage,
      }),
      {
        status: 500,
        headers,
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
    const origin = request.headers.get('Origin') || undefined;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      const headers = corsHeaders(origin);
      if (!headers) {
        return new Response(
          JSON.stringify({
            error: 'Forbidden',
            message: 'Origin not allowed',
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }

      return new Response(null, {
        status: 204,
        headers,
      });
    }

    // Route handling
    switch (url.pathname) {
      case '/health':
        return handleHealthCheck(env, origin);

      case '/tools':
        if (request.method !== 'GET') {
          const baseHeaders = {
            'Content-Type': 'application/json',
            Allow: 'GET',
          };
          const headers = mergeCorsHeaders(baseHeaders, origin);

          if (headers instanceof Response) {
            return headers;
          }

          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            {
              status: 405,
              headers,
            }
          );
        }
        return handleListTools(origin);

      case '/api/tool':
        if (request.method !== 'POST') {
          const baseHeaders = {
            'Content-Type': 'application/json',
            Allow: 'POST',
          };
          const headers = mergeCorsHeaders(baseHeaders, origin);

          if (headers instanceof Response) {
            return headers;
          }

          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            {
              status: 405,
              headers,
            }
          );
        }
        return handleToolCall(request, env);

      case '/': {
        const baseHeaders = { 'Content-Type': 'application/json' };
        const headers = mergeCorsHeaders(baseHeaders, origin);

        if (headers instanceof Response) {
          return headers;
        }

        return new Response(
          JSON.stringify({
            server: 'eu-regulations-mcp',
            version: WORKER_VERSION,
            description:
              'HTTP API for EU cybersecurity regulations (ChatGPT/Copilot compatible)',
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
              headers:
                'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
            },
          }),
          {
            status: 200,
            headers,
          }
        );
      }

      default: {
        const baseHeaders = { 'Content-Type': 'application/json' };
        const headers = mergeCorsHeaders(baseHeaders, origin);

        if (headers instanceof Response) {
          return headers;
        }

        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers,
        });
      }
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
