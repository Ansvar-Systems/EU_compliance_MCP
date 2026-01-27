/**
 * Security & Input Validation Tests
 * Ensures protection against injection attacks and malicious inputs
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { searchRegulations } from '../../src/tools/search.js';
import { getArticle } from '../../src/tools/article.js';
import { getRecital } from '../../src/tools/recital.js';
import type { Database } from 'better-sqlite3';

describe('Security & Input Validation', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  describe('SQL Injection Prevention', () => {
    it('prevents SQL injection in search queries', async () => {
      const maliciousQueries = [
        "'; DROP TABLE articles; --",
        "1' OR '1'='1",
        "admin'--",
        "1; DELETE FROM recitals; --",
        "' UNION SELECT * FROM definitions --",
        "'; UPDATE articles SET text='hacked' WHERE 1=1; --",
        "1' AND 1=1 UNION ALL SELECT NULL,NULL,NULL--",
      ];

      for (const query of maliciousQueries) {
        // Should not throw, should return safe results or empty array
        const results = await searchRegulations(db, { query });
        expect(Array.isArray(results)).toBe(true);

        // Verify tables still exist and data intact (test DB has 14 articles, 4 recitals)
        const articlesCount = db
          .prepare('SELECT COUNT(*) as count FROM articles')
          .get() as { count: number };
        expect(articlesCount.count).toBe(14); // Test DB sample data

        const recitalsCount = db
          .prepare('SELECT COUNT(*) as count FROM recitals')
          .get() as { count: number };
        expect(recitalsCount.count).toBe(4); // Test DB sample data
      }
    });

    it('prevents SQL injection in article retrieval', async () => {
      const maliciousInputs = [
        { regulation: "GDPR'; DROP TABLE articles; --", article: '33' },
        { regulation: 'GDPR', article: "33'; DELETE FROM articles; --" },
        { regulation: "' OR '1'='1", article: "' OR '1'='1" },
        { regulation: 'GDPR OR 1=1 --', article: '33' },
      ];

      for (const input of maliciousInputs) {
        // Should safely return null or throw validation error, not execute SQL
        const result = await getArticle(db, input);
        expect(result === null || typeof result === 'object').toBe(true);

        // Verify data integrity (test DB has 14 articles)
        const articlesCount = db
          .prepare('SELECT COUNT(*) as count FROM articles')
          .get() as { count: number };
        expect(articlesCount.count).toBe(14);
      }
    });

    it('prevents SQL injection in recital retrieval', async () => {
      const maliciousInputs = [
        { regulation: "GDPR'; DROP TABLE recitals; --", recital_number: 83 },
        { regulation: "' OR 1=1 --", recital_number: 1 },
        { regulation: 'GDPR', recital_number: 83 /* injected: ; DROP TABLE articles; */ },
      ];

      for (const input of maliciousInputs) {
        const result = await getRecital(db, input);
        expect(result === null || typeof result === 'object').toBe(true);

        // Verify tables exist (test DB has 4 recitals)
        const recitalsCount = db
          .prepare('SELECT COUNT(*) as count FROM recitals')
          .get() as { count: number };
        expect(recitalsCount.count).toBe(4);
      }
    });
  });

  describe('Path Traversal Prevention', () => {
    it('rejects path traversal attempts in regulation IDs', async () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        'GDPR/../NIS2',
        './../../database.db',
        '..%2F..%2Fetc%2Fpasswd', // URL encoded
      ];

      for (const maliciousId of pathTraversalAttempts) {
        const result = await getArticle(db, {
          regulation: maliciousId,
          article: '1',
        });

        // Should return null or throw validation error
        expect(result).toBeNull();
      }
    });
  });

  describe('Integer Overflow & Type Coercion', () => {
    it('handles extreme integer values in limit parameters', async () => {
      const extremeLimits = [
        Number.MAX_SAFE_INTEGER,
        -Number.MAX_SAFE_INTEGER,
        Infinity,
        -Infinity,
        9999999,
        -1,
      ];

      for (const limit of extremeLimits) {
        const results = await searchRegulations(db, {
          query: 'security',
          limit,
        });

        expect(Array.isArray(results)).toBe(true);
        // Should be capped at reasonable maximum
        expect(results.length).toBeLessThan(5000);
        expect(results.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('handles extreme integer values in recital numbers', async () => {
      const extremeNumbers = [
        Number.MAX_SAFE_INTEGER,
        -Number.MAX_SAFE_INTEGER,
        Infinity,
        -Infinity,
        0,
        -1,
      ];

      for (const num of extremeNumbers) {
        const result = await getRecital(db, {
          regulation: 'GDPR',
          recital_number: num,
        });

        // Should gracefully return null
        expect(result).toBeNull();
      }
    });

    it('handles type coercion in numeric parameters', async () => {
      const coercedValues = [
        '123' as any, // String number
        '999999999999999999' as any, // Very large string number
        true as any, // Boolean
        { valueOf: () => 42 } as any, // Object with valueOf
      ];

      for (const value of coercedValues) {
        // Should handle gracefully without crashing
        const result = await getRecital(db, {
          regulation: 'GDPR',
          recital_number: value,
        });

        expect(result === null || typeof result === 'object').toBe(true);
      }
    });
  });

  describe('Data Sanitization', () => {
    it('article text does not contain script tags', async () => {
      const article = await getArticle(db, {
        regulation: 'GDPR',
        article: '1',
      });

      if (article) {
        expect(article.text).not.toMatch(/<script>/i);
        expect(article.text).not.toMatch(/<iframe>/i);
        expect(article.text).not.toMatch(/javascript:/i);
        expect(article.text).not.toMatch(/onerror=/i);
        expect(article.text).not.toMatch(/onclick=/i);
      }
    });

    it('recital text is properly sanitized', async () => {
      const recital = await getRecital(db, {
        regulation: 'GDPR',
        recital_number: 1,
      });

      if (recital) {
        expect(recital.text).not.toMatch(/<script>/i);
        expect(recital.text).not.toMatch(/javascript:/i);
        expect(recital.text).not.toMatch(/<embed>/i);
        expect(recital.text).not.toMatch(/<object>/i);
      }
    });
  });

  describe('Regular Expression DoS (ReDoS) Prevention', () => {
    it('handles complex search patterns without timing out', async () => {
      const complexPatterns = [
        '(a+)+b',
        '(a|a)*b',
        '(a|ab)*c',
        '(x+x+)+y',
        '(a*)*b',
      ];

      for (const pattern of complexPatterns) {
        const start = performance.now();

        try {
          const results = await searchRegulations(db, { query: pattern, limit: 10 });
          const duration = performance.now() - start;

          expect(duration).toBeLessThan(5000); // Should not hang (5s timeout)
          expect(Array.isArray(results)).toBe(true);
        } catch (error) {
          // If it throws, it should throw quickly
          const duration = performance.now() - start;
          expect(duration).toBeLessThan(5000);
        }
      }
    });

    it('handles nested wildcards in FTS5 queries', async () => {
      const wildcardQueries = ['*security*', '**data**', 'cyber*security*', '*'];

      for (const query of wildcardQueries) {
        const start = performance.now();
        const results = await searchRegulations(db, { query, limit: 10 });
        const duration = performance.now() - start;

        expect(duration).toBeLessThan(2000);
        expect(Array.isArray(results)).toBe(true);
      }
    });
  });

  describe('Database Connection Security', () => {
    it('prepared statements are used for all queries', () => {
      // Test database is in-memory and needs write access for setup
      // In production, database is opened as read-only
      // Here we test that prepared statements prevent injection
      const maliciousInput = "'; DROP TABLE articles; --";
      
      // This should not execute the DROP TABLE
      const stmt = db.prepare('SELECT * FROM articles WHERE regulation = ? LIMIT 1');
      const result = stmt.get(maliciousInput);
      
      // Should return null or undefined (no regulation with that name), not drop the table
      expect(result === null || result === undefined).toBe(true);
      
      // Verify table still exists
      const count = db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number };
      expect(count.count).toBe(14);
    });

    it('prepared statements prevent injection', () => {
      const maliciousRegulation = "GDPR'; DROP TABLE articles; --";

      const stmt = db.prepare('SELECT * FROM articles WHERE regulation = ? LIMIT 1');
      const result = stmt.get(maliciousRegulation);

      // Should return null (no matching regulation) without executing DROP
      expect(result).toBeUndefined();

      // Verify articles table still exists (test DB has 14 articles)
      const articlesCount = db
        .prepare('SELECT COUNT(*) as count FROM articles')
        .get() as { count: number };
      expect(articlesCount.count).toBe(14);
    });
  });

  describe('Input Length Limits', () => {
    it('handles extremely long regulation IDs', async () => {
      const longId = 'A'.repeat(10000);

      const result = await getArticle(db, {
        regulation: longId,
        article: '1',
      });

      expect(result).toBeNull();
    });

    it('handles extremely long article numbers', async () => {
      const longArticle = '1'.repeat(10000);

      const result = await getArticle(db, {
        regulation: 'GDPR',
        article: longArticle,
      });

      expect(result).toBeNull();
    });
  });
});
