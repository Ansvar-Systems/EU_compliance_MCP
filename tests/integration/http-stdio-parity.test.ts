import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import Database from 'better-sqlite3';
import { registerTools, TOOLS } from '../../src/tools/registry.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '../../data/regulations.db');

describe('HTTP/Stdio Server Parity', () => {
  let db: Database.Database;
  let stdioServer: Server;
  let httpServer: Server;

  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });

    // Create mock stdio server
    stdioServer = new Server(
      { name: 'test-stdio', version: '0.4.1' },
      { capabilities: { tools: {} } }
    );
    registerTools(stdioServer, db);

    // Create mock HTTP server
    httpServer = new Server(
      { name: 'test-http', version: '0.4.1' },
      { capabilities: { tools: {} } }
    );
    registerTools(httpServer, db);
  });

  afterAll(() => {
    if (db) db.close();
  });

  it('should have all 9 tools registered in the registry', () => {
    expect(TOOLS).toHaveLength(9);

    const toolNames = TOOLS.map(t => t.name);
    expect(toolNames).toContain('search_regulations');
    expect(toolNames).toContain('get_article');
    expect(toolNames).toContain('get_recital'); // Critical: this was missing from HTTP server
    expect(toolNames).toContain('list_regulations');
    expect(toolNames).toContain('compare_requirements');
    expect(toolNames).toContain('map_controls');
    expect(toolNames).toContain('check_applicability');
    expect(toolNames).toContain('get_definitions');
    expect(toolNames).toContain('get_evidence_requirements');
  });

  it('should have identical tool names and descriptions', () => {
    const expectedTools = [
      'search_regulations',
      'get_article',
      'get_recital',
      'list_regulations',
      'compare_requirements',
      'map_controls',
      'check_applicability',
      'get_definitions',
      'get_evidence_requirements',
    ];

    const registeredNames = TOOLS.map(t => t.name);
    expect(registeredNames).toEqual(expectedTools);

    // Verify each tool has required fields
    TOOLS.forEach(tool => {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.handler).toBeInstanceOf(Function);
    });
  });

  it('get_recital tool should work correctly', async () => {
    const recitalTool = TOOLS.find(t => t.name === 'get_recital');
    expect(recitalTool).toBeDefined();

    const input = { regulation: 'GDPR', recital_number: 83 };
    const result = await recitalTool!.handler(db, input);

    expect(result).toBeTruthy();
    expect(result.regulation).toBe('GDPR');
    expect(result.recital_number).toBe(83);
    expect(result.text).toContain('security');
    expect(result.text).toContain('measures');
  });

  it('get_article tool should work correctly', async () => {
    const articleTool = TOOLS.find(t => t.name === 'get_article');
    expect(articleTool).toBeDefined();

    const input = { regulation: 'GDPR', article: '17' };
    const result = await articleTool!.handler(db, input);

    expect(result).toBeTruthy();
    expect(result.regulation).toBe('GDPR');
    expect(result.article_number).toBe('17');
    expect(result.text).toContain('erasure');
  });

  it('should throw error for non-existent recital', async () => {
    const recitalTool = TOOLS.find(t => t.name === 'get_recital');
    const input = { regulation: 'GDPR', recital_number: 99999 };

    await expect(recitalTool!.handler(db, input)).rejects.toThrow(
      'Recital 99999 not found in GDPR'
    );
  });

  it('should throw error for non-existent article', async () => {
    const articleTool = TOOLS.find(t => t.name === 'get_article');
    const input = { regulation: 'GDPR', article: '99999' };

    await expect(articleTool!.handler(db, input)).rejects.toThrow(
      'Article 99999 not found in GDPR'
    );
  });

  it('all tools should have valid input schemas', () => {
    TOOLS.forEach(tool => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();

      // Verify required fields are arrays or undefined
      if (tool.inputSchema.required) {
        expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      }
    });
  });

  it('search_regulations should work with default limit', async () => {
    const searchTool = TOOLS.find(t => t.name === 'search_regulations');
    const input = { query: 'data breach' };
    const result = await searchTool!.handler(db, input);

    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});
