import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { registerTools } from '../../src/tools/registry.js';
import { createSqliteAdapter } from '../../src/database/sqlite-adapter.js';
import type { DatabaseAdapter } from '../../src/database/types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '../../data/regulations.db');

/**
 * Protocol-level envelope tests for the MCP ``CallToolResult`` shape.
 *
 * Why this file exists: the registry wraps tool results into a dual
 * envelope — the original JSON (with ``_citation``) inside
 * ``content[0].text``, plus a protocol-level ``_meta`` that repeats
 * ``_citation``. Both seams matter because they have different
 * consumers:
 *
 * - ``content[0].text._citation`` — what the MCP Gateway's fanout
 *   reads when it parses the text block (``src/fanout.py``
 *   ``_flatten_data_wrapper``). If ``_citation`` is missing here, the
 *   gateway's ``wrap_with_citations`` can never populate
 *   ``citation.source_url`` on the response.
 *
 * - ``_meta._citation`` — what the Watchdog and grounding-enforcement
 *   read (MCP spec ``CallToolResult._meta``). Stripping ``_citation``
 *   *only* here is what commit ``0ff2dd4`` originally did; the
 *   gateway silently lost the URL because nothing was reading
 *   content-level anymore. This file regression-guards that seam.
 */
describe('CallToolResult envelope', () => {
  let rawDb: Database.Database;
  let db: DatabaseAdapter;
  let server: Server;

  beforeAll(() => {
    rawDb = new Database(DB_PATH, { readonly: true });
    db = createSqliteAdapter(rawDb);
    server = new Server(
      { name: 'test-envelope', version: '0.0.0' },
      { capabilities: { tools: {} } },
    );
    registerTools(server, db);
  });

  afterAll(() => {
    if (rawDb) rawDb.close();
  });

  /**
   * Invoke a tool through the registered ``CallToolRequest`` handler so
   * the test exercises the real wrapping path, not the bare handler
   * return value. Uses the private ``_requestHandlers`` map to reach
   * the handler — the SDK doesn't expose a public invoke for tests.
   */
  async function callTool(name: string, args: Record<string, unknown>) {
    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown, extra: unknown) => Promise<unknown>>;
    })._requestHandlers.get('tools/call');
    if (!handler) throw new Error('tools/call handler not registered');
    const request = {
      method: 'tools/call',
      params: { name, arguments: args },
    };
    return (await handler(request, {})) as {
      _meta?: Record<string, unknown>;
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
  }

  describe('get_article', () => {
    it('emits _citation.source_url inside content[0].text (gateway-readable seam)', async () => {
      const result = await callTool('get_article', { regulation: 'GDPR', article: '32' });
      const body = JSON.parse(result.content[0].text) as {
        _citation?: { source_url?: string };
      };
      expect(body._citation).toBeDefined();
      expect(body._citation?.source_url).toBe(
        'https://eur-lex.europa.eu/eli/reg/2016/679/oj#art_32',
      );
    });

    it('also emits _citation.source_url at protocol _meta (watchdog-readable seam)', async () => {
      const result = await callTool('get_article', { regulation: 'GDPR', article: '32' });
      const metaCitation = (result._meta?._citation as { source_url?: string } | undefined);
      expect(metaCitation).toBeDefined();
      expect(metaCitation?.source_url).toBe(
        'https://eur-lex.europa.eu/eli/reg/2016/679/oj#art_32',
      );
    });

    it('preserves article payload fields (title, text) alongside _citation', async () => {
      const result = await callTool('get_article', { regulation: 'GDPR', article: '32' });
      const body = JSON.parse(result.content[0].text) as {
        regulation?: string;
        article_number?: string;
        title?: string;
        text?: string;
      };
      expect(body.regulation).toBe('GDPR');
      expect(body.article_number).toBe('32');
      expect(body.title).toBe('Security of processing');
      expect(typeof body.text).toBe('string');
    });
  });

  describe('get_recital', () => {
    it('emits _citation.source_url inside content[0].text', async () => {
      const result = await callTool('get_recital', { regulation: 'GDPR', recital_number: 83 });
      const body = JSON.parse(result.content[0].text) as {
        _citation?: { source_url?: string };
      };
      expect(body._citation?.source_url).toBe(
        'https://eur-lex.europa.eu/eli/reg/2016/679/oj#rct_83',
      );
    });

    it('uses dir ELI type for directives (NIS2)', async () => {
      const result = await callTool('get_recital', { regulation: 'NIS2', recital_number: 1 });
      const body = JSON.parse(result.content[0].text) as {
        _citation?: { source_url?: string };
      };
      expect(body._citation?.source_url).toBe(
        'https://eur-lex.europa.eu/eli/dir/2022/2555/oj#rct_1',
      );
    });
  });
});
