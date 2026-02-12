/**
 * Performance & Scalability Tests
 * Verifies memory usage, concurrency, and database integrity under load
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { searchRegulations } from '../../src/tools/search.js';
import { getArticle } from '../../src/tools/article.js';
import { mapControls } from '../../src/tools/map.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('Performance & Scalability', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  describe('Concurrent Operations', () => {
    it('handles mixed concurrent operations without errors', async () => {
      const operations = [
        searchRegulations(db, { query: 'security', limit: 10 }),
        getArticle(db, { regulation: 'GDPR', article: '33' }),
        searchRegulations(db, { query: 'incident', limit: 10 }),
        getArticle(db, { regulation: 'NIS2', article: '23' }),
        mapControls(db, { framework: 'ISO27001', control: 'A.5.1' }),
        searchRegulations(db, { query: 'risk assessment', limit: 10 }),
      ];

      const results = await Promise.all(operations);

      // All operations complete successfully
      expect(results).toHaveLength(6);
      expect(results[0]).toBeInstanceOf(Array); // search results
      expect(results[1]).toHaveProperty('regulation'); // article
    });
  });

  describe('Memory Usage', () => {
    it('searches large dataset without excessive memory usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Run 50 searches
      for (let i = 0; i < 50; i++) {
        await searchRegulations(db, {
          query: `security test ${i}`,
          limit: 50,
        });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncreaseMB = (finalMemory - initialMemory) / 1024 / 1024;

      // Should not leak memory excessively (< 50MB increase)
      expect(memoryIncreaseMB).toBeLessThan(50);
    });
  });

  describe('Database Integrity Under Load', () => {
    it('maintains FTS5 index consistency after many searches', async () => {
      // Perform 100 varied searches
      for (let i = 0; i < 100; i++) {
        await searchRegulations(db, {
          query: `test query ${i % 10}`,
          limit: 20,
        });
      }

      // Verify FTS5 index still matches articles table
      const articlesResult = await db.query('SELECT COUNT(*) as count FROM articles');
      const articlesCount = articlesResult.rows[0] as { count: number };
      const ftsResult = await db.query('SELECT COUNT(*) as count FROM articles_fts');
      const ftsCount = ftsResult.rows[0] as { count: number };

      expect(articlesCount.count).toBe(ftsCount.count);
      expect(articlesCount.count).toBeGreaterThan(0);
    });
  });

  describe('Query Correctness', () => {
    it('FTS5 search returns expected results', async () => {
      const results = await searchRegulations(db, { query: 'security', limit: 50 });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(50);
    });

    it('filtered search respects regulation parameter', async () => {
      const results = await searchRegulations(db, {
        query: 'security',
        regulations: ['GDPR'],
        limit: 50,
      });

      expect(Array.isArray(results)).toBe(true);
      // All results should be from GDPR
      results.forEach(r => expect(r.regulation).toBe('GDPR'));
    });
  });
});
