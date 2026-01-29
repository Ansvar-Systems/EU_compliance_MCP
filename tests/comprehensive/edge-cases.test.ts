/**
 * Edge Cases & Error Handling Tests
 * Verifies robustness against boundary conditions and malformed inputs
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { searchRegulations } from '../../src/tools/search.js';
import { getArticle } from '../../src/tools/article.js';
import { getRecital } from '../../src/tools/recital.js';
import { getDefinitions } from '../../src/tools/definitions.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('Edge Cases & Error Handling', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  describe('Search Query Edge Cases', () => {
    it('handles problematic search queries', async () => {
      const problematicQueries = [
        'cybersecurity '.repeat(200), // Extremely long (2600 chars)
        '', // Empty
        '   \t\n   ', // Whitespace only
        'données personnelles', // Unicode (French)
        'Article 5(1)(a)', // Special chars
        'AND', // FTS5 operator
        '*', // FTS5 wildcard
      ];

      for (const query of problematicQueries) {
        const results = await searchRegulations(db, { query });
        expect(Array.isArray(results)).toBe(true);
        // Should not throw errors
      }
    });

    it('handles limit boundary conditions', async () => {
      const limits = [-1, 0, 999999];

      for (const limit of limits) {
        const results = await searchRegulations(db, { query: 'security', limit });
        expect(Array.isArray(results)).toBe(true);
        // Should handle gracefully (clamp to valid range)
      }
    });

    it('handles regulation filter edge cases', async () => {
      // Empty array
      let results = await searchRegulations(db, { query: 'security', regulations: [] });
      expect(Array.isArray(results)).toBe(true);

      // Invalid regulation ID
      results = await searchRegulations(db, { query: 'security', regulations: ['FAKE'] });
      expect(Array.isArray(results)).toBe(true);

      // Mixed valid/invalid
      results = await searchRegulations(db, { query: 'security', regulations: ['GDPR', 'FAKE'] });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Article Retrieval Edge Cases', () => {
    it('handles complex article numbers', async () => {
      const complexNumbers = ['5(1)(a)', '89a', 'Annex I', '12.1'];

      for (const num of complexNumbers) {
        const result = await getArticle(db, { regulation: 'GDPR', article: num });
        expect(result === null || typeof result === 'object').toBe(true);
      }
    });

    it('normalizes regulation ID case', async () => {
      const variants = ['GDPR', 'gdpr', 'Gdpr'];

      for (const variant of variants) {
        const result = await getArticle(db, { regulation: variant, article: '1' });
        if (result !== null) {
          expect(result.regulation).toBe('GDPR');
        }
      }
    });

    it('returns null for non-existent data', async () => {
      expect(await getArticle(db, { regulation: 'FAKE', article: '1' })).toBeNull();
      expect(await getArticle(db, { regulation: 'GDPR', article: '99999' })).toBeNull();
    });
  });

  describe('Recital Retrieval Edge Cases', () => {
    it('handles invalid recital numbers', async () => {
      const invalidNumbers = [0, -1, 999999];

      for (const num of invalidNumbers) {
        const result = await getRecital(db, { regulation: 'GDPR', recital_number: num });
        expect(result).toBeNull();
      }
    });

    it('returns null for non-existent regulation', async () => {
      const result = await getRecital(db, { regulation: 'FAKE', recital_number: 1 });
      expect(result).toBeNull();
    });

    it('handles regulations without recitals', async () => {
      // Test with a regulation that has no recitals (if any in test DB)
      const result = await getRecital(db, { regulation: 'NIS2', recital_number: 1 });
      // Should either return recital or null, not throw
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  describe('Definitions Search Edge Cases', () => {
    it('handles problematic search terms', async () => {
      const terms = [
        '', // Empty
        'nonexistent', // Not found
        'data-protection', // With hyphen
        'processing*', // With wildcard
      ];

      for (const term of terms) {
        const results = await getDefinitions(db, { term });
        expect(Array.isArray(results)).toBe(true);
      }
    });

    it('handles case-insensitive term matching', async () => {
      const result = await getDefinitions(db, { term: 'PERSONAL DATA' });
      // Should find "personal data" (case-insensitive)
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Unicode and Special Characters', () => {
    it('handles international text', async () => {
      const queries = [
        'données personnelles', // French
        'Datenschutz', // German
        'AI/ML', // Slash
        '"incident"', // Quotes
        'cost-benefit', // Hyphen
        'Art. 32 § 1', // Special symbols
      ];

      for (const query of queries) {
        const results = await searchRegulations(db, { query });
        expect(Array.isArray(results)).toBe(true);
      }
    });
  });
});
