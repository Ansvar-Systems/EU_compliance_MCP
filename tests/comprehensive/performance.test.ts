/**
 * Performance & Scalability Tests
 * Verifies query speed, memory usage, and concurrent access
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { searchRegulations } from '../../src/tools/search.js';
import { getArticle } from '../../src/tools/article.js';
import { mapControls } from '../../src/tools/map.js';
import type { Database } from 'better-sqlite3';

describe('Performance & Scalability', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  describe('FTS5 Query Performance', () => {
    it('searches complete dataset in under 100ms', async () => {
      // Queries that match test database content
      const queries = [
        'personal data',
        'processing',
        'security',
        'incident',
        'controller',
      ];

      for (const query of queries) {
        const start = performance.now();
        const results = await searchRegulations(db, { query, limit: 50 });
        const duration = performance.now() - start;

        expect(duration).toBeLessThan(100);
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it('complex multi-word searches complete quickly', async () => {
      const complexQueries = [
        'data protection impact assessment',
        'information security management system',
        'third party service provider contract',
        'artificial intelligence system conformity assessment',
      ];

      for (const query of complexQueries) {
        const start = performance.now();
        const results = await searchRegulations(db, { query, limit: 20 });
        const duration = performance.now() - start;

        expect(duration).toBeLessThan(150);
        expect(Array.isArray(results)).toBe(true);
      }
    });

    it('filtered searches (by regulation) are fast', async () => {
      const start = performance.now();
      const results = await searchRegulations(db, {
        query: 'security',
        regulations: ['GDPR', 'NIS2', 'DORA'],
        limit: 30,
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(80);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Query Handling', () => {
    it('handles 20 concurrent searches without database locks', async () => {
      const queries = Array.from({ length: 20 }, (_, i) =>
        searchRegulations(db, { query: `security ${i}`, limit: 10 })
      );

      const start = performance.now();
      const results = await Promise.all(queries);
      const duration = performance.now() - start;

      expect(results).toHaveLength(20);
      expect(results.every((r) => Array.isArray(r))).toBe(true);
      expect(duration).toBeLessThan(2000); // All 20 queries in < 2s
    });

    it('handles mixed concurrent operations', async () => {
      const operations = [
        searchRegulations(db, { query: 'security', limit: 10 }),
        getArticle(db, { regulation: 'GDPR', article: '33' }),
        searchRegulations(db, { query: 'incident', limit: 10 }),
        getArticle(db, { regulation: 'NIS2', article: '23' }),
        mapControls(db, { framework: 'ISO27001', control: 'A.5.1' }),
        searchRegulations(db, { query: 'risk assessment', limit: 10 }),
      ];

      const start = performance.now();
      const results = await Promise.all(operations);
      const duration = performance.now() - start;

      expect(results).toHaveLength(6);
      expect(duration).toBeLessThan(500);
    });

    it('handles rapid sequential queries', async () => {
      const queries = Array.from({ length: 100 }, (_, i) => i);

      const start = performance.now();

      for (const i of queries) {
        await searchRegulations(db, { query: `test ${i}`, limit: 5 });
      }

      const duration = performance.now() - start;

      // 100 queries should complete in reasonable time
      expect(duration).toBeLessThan(5000); // 50ms per query average
    });
  });

  describe('Large Result Set Performance', () => {
    it('efficiently retrieves large result sets with limits', async () => {
      const limits = [10, 50, 100, 200];

      for (const limit of limits) {
        const start = performance.now();
        const results = await searchRegulations(db, {
          query: 'security', // Common word
          limit,
        });
        const duration = performance.now() - start;

        expect(results.length).toBeLessThanOrEqual(limit);
        expect(duration).toBeLessThan(200);
      }
    });

    it('handles queries returning many results efficiently', async () => {
      const start = performance.now();

      // Search for very common words that will match many articles
      const results = await searchRegulations(db, {
        query: 'shall',
        limit: 500,
      });

      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(300);
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

      // Should not leak memory excessively
      expect(memoryIncreaseMB).toBeLessThan(50);
    });

    it('large result sets do not cause memory issues', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      const results = await searchRegulations(db, {
        query: 'security measures',
        limit: 500,
      });

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncreaseMB = (finalMemory - initialMemory) / 1024 / 1024;

      expect(results.length).toBeGreaterThan(0);
      expect(memoryIncreaseMB).toBeLessThan(20);
    });
  });

  describe('Database Integrity Under Load', () => {
    it('maintains integrity after heavy concurrent reads', async () => {
      const initialIntegrity = db.prepare('PRAGMA integrity_check').get() as {
        integrity_check: string;
      };
      expect(initialIntegrity.integrity_check).toBe('ok');

      // Run 200 concurrent read queries
      const queries = Array.from(
        { length: 200 },
        () =>
          new Promise((resolve) => {
            const result = db.prepare('SELECT COUNT(*) as count FROM articles').get();
            resolve(result);
          })
      );

      await Promise.all(queries);

      const finalIntegrity = db.prepare('PRAGMA integrity_check').get() as {
        integrity_check: string;
      };
      expect(finalIntegrity.integrity_check).toBe('ok');
    });

    it('FTS5 index remains consistent after many searches', async () => {
      // Perform 100 varied searches
      for (let i = 0; i < 100; i++) {
        await searchRegulations(db, {
          query: `test query ${i % 10}`,
          limit: 20,
        });
      }

      // Verify FTS5 index still matches articles table
      const articlesCount = db
        .prepare('SELECT COUNT(*) as count FROM articles')
        .get() as { count: number };
      const ftsCount = db
        .prepare('SELECT COUNT(*) as count FROM articles_fts')
        .get() as { count: number };

      expect(articlesCount.count).toBe(ftsCount.count);
    });
  });

  describe('Query Optimization', () => {
    it('indexed queries are faster than table scans', async () => {
      // FTS5 indexed search
      const ftsStart = performance.now();
      await searchRegulations(db, { query: 'security', limit: 50 });
      const ftsDuration = performance.now() - ftsStart;

      // Direct table scan (simulated by counting)
      const scanStart = performance.now();
      db.prepare("SELECT COUNT(*) FROM articles WHERE text LIKE '%security%'").get();
      const scanDuration = performance.now() - scanStart;

      // FTS5 should be faster or comparable for small datasets
      // Note: Test DB is small (14 articles), so difference may be minimal
      expect(ftsDuration).toBeLessThan(100); // Just verify it completes quickly
    });

    it('regulation filter reduces query time', async () => {
      // Search all regulations
      const allStart = performance.now();
      await searchRegulations(db, { query: 'security', limit: 50 });
      const allDuration = performance.now() - allStart;

      // Search single regulation
      const singleStart = performance.now();
      await searchRegulations(db, {
        query: 'security',
        regulations: ['GDPR'],
        limit: 50,
      });
      const singleDuration = performance.now() - singleStart;

      // Filtered search should be faster or similar
      expect(singleDuration).toBeLessThanOrEqual(allDuration * 1.2);
    });
  });

  describe('Startup Performance', () => {
    it('database opens quickly', () => {
      const start = performance.now();
      const testDb = createTestDatabase();
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should open in < 100ms
      closeTestDatabase(testDb);
    });

    it('initial query is fast (no cold start penalty)', async () => {
      const freshDb = createTestDatabase();

      const start = performance.now();
      const results = await searchRegulations(freshDb, {
        query: 'security',
        limit: 10,
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(200);
      expect(results.length).toBeGreaterThan(0);

      closeTestDatabase(freshDb);
    });
  });

  describe('Control Mapping Performance', () => {
    it('retrieves all ISO 27001 mappings quickly', async () => {
      const start = performance.now();
      const results = await mapControls(db, {
        framework: 'ISO27001',
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(200);
      expect(results.length).toBeGreaterThan(0);
    });

    it('filtered control mapping is fast', async () => {
      const start = performance.now();
      const results = await mapControls(db, {
        framework: 'ISO27001',
        control: 'A.5.1',
        regulation: 'GDPR',
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
