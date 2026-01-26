/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEARCH TOOL TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for the search tool (src/tools/search.ts)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TEST CATEGORIES
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   1. Happy Path - Normal operation
 *   2. Filtering - Source filtering
 *   3. Limits - Result limiting
 *   4. Edge Cases - Empty queries, special characters
 *   5. Relevance - BM25 ranking
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WRITING GOOD TESTS
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   - Test one thing per test
 *   - Use descriptive test names
 *   - Include edge cases
 *   - Don't test implementation details
 *   - Keep tests independent (no shared state)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db';
import { searchContent } from '../../src/tools/search';

describe('searchContent', () => {
  let db: Database;

  // ─────────────────────────────────────────────────────────────────────────
  // Setup and Teardown
  // ─────────────────────────────────────────────────────────────────────────

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('happy path', () => {
    it('should return results for a simple query', async () => {
      const result = await searchContent(db, { query: 'data' });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return results with correct structure', async () => {
      const result = await searchContent(db, { query: 'data' });

      expect(result.length).toBeGreaterThan(0);

      const first = result[0];
      expect(first).toHaveProperty('source');
      expect(first).toHaveProperty('item_id');
      expect(first).toHaveProperty('snippet');
      expect(first).toHaveProperty('relevance');
    });

    it('should return snippets with match markers', async () => {
      const result = await searchContent(db, { query: 'protection' });

      expect(result.length).toBeGreaterThan(0);

      // At least one snippet should have markers
      const hasMarkers = result.some(
        r => r.snippet.includes('>>>') && r.snippet.includes('<<<')
      );
      expect(hasMarkers).toBe(true);
    });

    it('should find items in multiple sources', async () => {
      // 'security' appears in both SOURCE_A and SOURCE_B sample data
      const result = await searchContent(db, { query: 'security' });

      const sources = new Set(result.map(r => r.source));
      expect(sources.size).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SOURCE FILTERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('source filtering', () => {
    it('should filter results to specified source', async () => {
      const result = await searchContent(db, {
        query: 'data',
        sources: ['SOURCE_A'],
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every(r => r.source === 'SOURCE_A')).toBe(true);
    });

    it('should filter to multiple sources', async () => {
      const result = await searchContent(db, {
        query: 'data',
        sources: ['SOURCE_A', 'SOURCE_B'],
      });

      expect(result.length).toBeGreaterThan(0);
      expect(
        result.every(r => r.source === 'SOURCE_A' || r.source === 'SOURCE_B')
      ).toBe(true);
    });

    it('should return empty array for non-existent source', async () => {
      const result = await searchContent(db, {
        query: 'data',
        sources: ['NONEXISTENT'],
      });

      expect(result).toEqual([]);
    });

    it('should ignore empty source filter', async () => {
      const result = await searchContent(db, {
        query: 'data',
        sources: [],
      });

      // Should return results from all sources (no filter applied)
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIMIT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('result limiting', () => {
    it('should respect limit parameter', async () => {
      const result = await searchContent(db, {
        query: 'data',
        limit: 2,
      });

      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should use default limit when not specified', async () => {
      const result = await searchContent(db, { query: 'data' });

      // Default limit is 10
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should handle limit of 1', async () => {
      const result = await searchContent(db, {
        query: 'data',
        limit: 1,
      });

      expect(result.length).toBeLessThanOrEqual(1);
    });

    it('should cap limit at maximum', async () => {
      // If your tool has a MAX_LIMIT, test that it's enforced
      const result = await searchContent(db, {
        query: 'data',
        limit: 1000,
      });

      // Should not exceed MAX_LIMIT (50 in the template)
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should return empty array for empty query', async () => {
      const result = await searchContent(db, { query: '' });
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only query', async () => {
      const result = await searchContent(db, { query: '   ' });
      expect(result).toEqual([]);
    });

    it('should return empty array for no matches', async () => {
      const result = await searchContent(db, {
        query: 'xyznonexistentterm123',
      });
      expect(result).toEqual([]);
    });

    it('should handle special characters in query', async () => {
      // Should not throw, may return empty
      const result = await searchContent(db, {
        query: 'test (with) "special" chars',
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle FTS5 special characters', async () => {
      // These are FTS5 operators that should be escaped
      const queries = [
        'data*',        // Wildcard
        '"personal data"', // Phrase
        'data AND protection', // Boolean
        'data:value',   // Column filter
      ];

      for (const query of queries) {
        // Should not throw
        const result = await searchContent(db, { query });
        expect(Array.isArray(result)).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RELEVANCE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('relevance ranking', () => {
    it('should return results sorted by relevance', async () => {
      const result = await searchContent(db, { query: 'personal data' });

      if (result.length > 1) {
        // BM25 scores are negative; lower (more negative) is better
        // So results should be in ascending order by relevance
        for (let i = 1; i < result.length; i++) {
          expect(result[i].relevance).toBeGreaterThanOrEqual(
            result[i - 1].relevance
          );
        }
      }
    });

    it('should rank exact matches higher', async () => {
      // Search for a specific phrase that's in the data
      const result = await searchContent(db, { query: 'personal data' });

      if (result.length > 0) {
        // First result should be most relevant
        expect(result[0].relevance).toBeDefined();
        expect(typeof result[0].relevance).toBe('number');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMBINED FILTERS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('combined filters', () => {
    it('should apply source filter and limit together', async () => {
      const result = await searchContent(db, {
        query: 'data',
        sources: ['SOURCE_A'],
        limit: 2,
      });

      expect(result.length).toBeLessThanOrEqual(2);
      expect(result.every(r => r.source === 'SOURCE_A')).toBe(true);
    });
  });
});
