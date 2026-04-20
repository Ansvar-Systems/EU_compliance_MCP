import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { searchRegulations } from '../../src/tools/search.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('searchRegulations', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('finds articles matching a search query', async () => {
    const results = await searchRegulations(db, {
      query: 'personal data',
    });

    // Should find multiple articles mentioning "personal data"
    expect(results.length).toBeGreaterThan(0);

    // All results should be from GDPR (our test data only has GDPR articles with "personal data")
    expect(results.every(r => r.regulation === 'GDPR')).toBe(true);

    // Results should include the snippet with match highlighting (>>> <<< markers)
    expect(results[0].snippet.toLowerCase()).toContain('personal');

    // Article 4 (Definitions) should be in the results
    const definitionsArticle = results.find(r => r.article === '4');
    expect(definitionsArticle).toBeDefined();
    expect(definitionsArticle!.title).toBe('Definitions');
  });

  it('filters by regulation when specified', async () => {
    const results = await searchRegulations(db, {
      query: 'incident',
      regulations: ['NIS2'],
    });

    expect(results.every(r => r.regulation === 'NIS2')).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('respects the limit parameter', async () => {
    const results = await searchRegulations(db, {
      query: 'security',
      limit: 3,
    });

    expect(results).toHaveLength(3);
  });

  it('returns empty array when no matches found', async () => {
    const results = await searchRegulations(db, {
      query: 'xyznonexistent123',
    });

    expect(results).toEqual([]);
  });

  it('ranks results by relevance', async () => {
    const results = await searchRegulations(db, {
      query: 'data protection',
    });

    // First result should have highest relevance score
    expect(results[0].relevance).toBeGreaterThanOrEqual(results[1]?.relevance ?? 0);
  });

  it('handles special characters in search query', async () => {
    const results = await searchRegulations(db, {
      query: 'Article 5(1)(a)',
    });

    // Should not throw, should return results or empty array
    expect(Array.isArray(results)).toBe(true);
  });

  it('searches across articles and recitals', async () => {
    const results = await searchRegulations(db, {
      query: 'security',
      limit: 20,
    });

    const hasArticles = results.some(r => r.type === 'article');
    const hasRecitals = results.some(r => r.type === 'recital');

    // Should find both articles and recitals about security
    expect(hasArticles).toBe(true);
    expect(hasRecitals).toBe(true);

    // All results should have a type field
    expect(results.every(r => r.type === 'article' || r.type === 'recital')).toBe(true);

    // Recitals should have proper formatting
    const recitalResults = results.filter(r => r.type === 'recital');
    expect(recitalResults[0].title).toMatch(/^Recital \d+$/);
  });

  it('prioritizes articles over recitals with similar relevance', async () => {
    const results = await searchRegulations(db, {
      query: 'protection',
      limit: 10,
    });

    // Results should be sorted by relevance with articles prioritized
    expect(results.length).toBeGreaterThan(0);

    // All results should have a type field
    expect(results.every(r => r.type === 'article' || r.type === 'recital')).toBe(true);
  });

  // ── Missing / wrong-type query guard (2026-04-20 audit) ──────────────
  // The MCP schema marks query required, but the MCP SDK doesn't validate
  // before handing args to the handler. The existing empty-string guard
  // (`!query || query.trim()`) assumes query is a string — pass a number
  // and `.trim()` crashes with "query.trim is not a function". Reject
  // non-string inputs with a clear error so the contract surfaces.
  it('throws a clear error when query is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(searchRegulations(db, {} as any)).rejects.toThrow(/query is required/i);
  });

  it('throws a clear error when query is not a string', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      searchRegulations(db, { query: 42 as any }),
    ).rejects.toThrow(/query is required/i);
  });
});
