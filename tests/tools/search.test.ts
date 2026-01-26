import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { searchRegulations } from '../../src/tools/search.js';
import type { Database } from 'better-sqlite3';

describe('searchRegulations', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
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
});
