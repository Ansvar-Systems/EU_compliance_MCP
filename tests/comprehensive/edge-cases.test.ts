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
import type { Database } from 'better-sqlite3';

describe('Edge Cases & Error Handling', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  describe('Search Query Edge Cases', () => {
    it('handles extremely long search queries', async () => {
      const longQuery = 'cybersecurity '.repeat(200); // 2600 chars

      const results = await searchRegulations(db, {
        query: longQuery,
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('handles unicode characters correctly', async () => {
      const unicodeQueries = [
        'données personnelles', // French
        'Datenschutz', // German
        'Article 5(1)(a)', // Parentheses
        'AI/ML systems', // Slash
        '"incident notification"', // Quotes
        'cost-benefit analysis', // Hyphens
        'Art. 32 § 1', // Special symbols
      ];

      for (const query of unicodeQueries) {
        const results = await searchRegulations(db, { query });
        expect(Array.isArray(results)).toBe(true);
        // Should not throw SQL errors
      }
    });

    it('handles empty search queries without crashing', async () => {
      const results = await searchRegulations(db, { query: '' });
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles whitespace-only queries', async () => {
      const results = await searchRegulations(db, { query: '   \t\n   ' });
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles special FTS5 characters', async () => {
      const specialChars = ['AND', 'OR', 'NOT', '*', '"', '(', ')', '-'];

      for (const char of specialChars) {
        const results = await searchRegulations(db, { query: char });
        expect(Array.isArray(results)).toBe(true);
      }
    });
  });

  describe('Article Retrieval Edge Cases', () => {
    it('handles article numbers with special formatting', async () => {
      const complexNumbers = ['5(1)(a)', '89a', 'Annex I', '12.1'];

      for (const num of complexNumbers) {
        // Should either return article or null, not throw
        const result = await getArticle(db, { regulation: 'GDPR', article: num });
        expect(result === null || typeof result === 'object').toBe(true);
      }
    });

    it('handles regulation ID case variations', async () => {
      const variants = ['GDPR', 'gdpr', 'Gdpr', 'gDpR'];

      for (const variant of variants) {
        const result = await getArticle(db, { regulation: variant, article: '1' });
        // Implementation should normalize to uppercase
        if (result !== null) {
          expect(result.regulation).toBe('GDPR');
        }
      }
    });

    it('returns null for non-existent regulation', async () => {
      const result = await getArticle(db, {
        regulation: 'FAKE_REGULATION',
        article: '1',
      });

      expect(result).toBeNull();
    });

    it('returns null for non-existent article number', async () => {
      const result = await getArticle(db, {
        regulation: 'GDPR',
        article: '99999',
      });

      expect(result).toBeNull();
    });
  });

  describe('Recital Retrieval Edge Cases', () => {
    it('handles zero recital number', async () => {
      const result = await getRecital(db, {
        regulation: 'GDPR',
        recital_number: 0,
      });

      expect(result).toBeNull();
    });

    it('handles negative recital numbers', async () => {
      const result = await getRecital(db, {
        regulation: 'GDPR',
        recital_number: -5,
      });

      expect(result).toBeNull();
    });

    it('handles extremely large recital numbers', async () => {
      const result = await getRecital(db, {
        regulation: 'GDPR',
        recital_number: 99999,
      });

      expect(result).toBeNull();
    });

    it('handles regulations without recitals gracefully', async () => {
      const regulationsWithoutRecitals = ['UN_R155', 'UN_R156'];

      for (const regulation of regulationsWithoutRecitals) {
        const result = await getRecital(db, {
          regulation,
          recital_number: 1,
        });

        expect(result).toBeNull();
      }
    });

    it('handles non-existent regulation in recital query', async () => {
      const result = await getRecital(db, {
        regulation: 'FAKE_REG',
        recital_number: 1,
      });

      expect(result).toBeNull();
    });
  });

  describe('Definition Search Edge Cases', () => {
    it('handles empty term search', async () => {
      const result = await getDefinitions(db, {
        term: '',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('handles term with special characters', async () => {
      const specialTerms = ["'personal data'", 'AI/ML', 'cost-benefit', 'e-mail'];

      for (const term of specialTerms) {
        const result = await getDefinitions(db, { term });
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      }
    });

    it('handles case-insensitive term matching', async () => {
      const variations = ['personal data', 'PERSONAL DATA', 'Personal Data', 'PeRsOnAl DaTa'];

      const results = await Promise.all(
        variations.map((term) => getDefinitions(db, { term, regulation: 'GDPR' }))
      );

      // All should return the same definition
      const firstResult = results[0];
      for (const result of results.slice(1)) {
        expect(result.length).toBe(firstResult.length);
      }
    });

    it('returns empty for non-existent term', async () => {
      const result = await getDefinitions(db, {
        term: 'xyznonexistent123',
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('Limit Parameter Edge Cases', () => {
    it('handles negative limit values', async () => {
      const results = await searchRegulations(db, {
        query: 'security',
        limit: -1,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('handles zero limit', async () => {
      const results = await searchRegulations(db, {
        query: 'security',
        limit: 0,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('handles extremely large limit values', async () => {
      const results = await searchRegulations(db, {
        query: 'security',
        limit: 99999,
      });

      expect(Array.isArray(results)).toBe(true);
      // Should be capped at reasonable maximum
      expect(results.length).toBeLessThan(5000);
    });
  });

  describe('Regulation Filter Edge Cases', () => {
    it('handles empty regulations array', async () => {
      const results = await searchRegulations(db, {
        query: 'security',
        regulations: [],
      });

      // Should search all regulations
      expect(results.length).toBeGreaterThan(0);
    });

    it('handles invalid regulation ID in filter', async () => {
      const results = await searchRegulations(db, {
        query: 'security',
        regulations: ['FAKE_REG'],
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    });

    it('handles mixed valid and invalid regulation IDs', async () => {
      const results = await searchRegulations(db, {
        query: 'security',
        regulations: ['GDPR', 'FAKE_REG', 'NIS2'],
      });

      expect(Array.isArray(results)).toBe(true);
      // Should return results from valid regulations only
      if (results.length > 0) {
        expect(['GDPR', 'NIS2']).toContain(results[0].regulation);
      }
    });
  });
});
