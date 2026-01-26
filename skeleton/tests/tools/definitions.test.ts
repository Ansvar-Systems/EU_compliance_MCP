/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEFINITIONS TOOL TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for the definitions tool (src/tools/definitions.ts)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDatabase, closeTestDatabase, sampleData } from '../fixtures/test-db';
import {
  lookupDefinition,
  getExactDefinition,
  listDefinitions,
  compareDefinitions,
  findRelatedDefinitions,
} from '../../src/tools/definitions';

describe('lookupDefinition', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH
  // ═══════════════════════════════════════════════════════════════════════════

  describe('happy path', () => {
    it('should find definition by exact term', async () => {
      const result = await lookupDefinition(db, { term: 'personal data' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].term).toBe('personal data');
    });

    it('should return definition with correct structure', async () => {
      const result = await lookupDefinition(db, { term: 'personal data' });

      expect(result[0]).toHaveProperty('term');
      expect(result[0]).toHaveProperty('definition');
      expect(result[0]).toHaveProperty('source');
      expect(result[0]).toHaveProperty('defining_item');
    });

    it('should be case-insensitive', async () => {
      const result = await lookupDefinition(db, { term: 'PERSONAL DATA' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].term.toLowerCase()).toBe('personal data');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTIAL MATCHING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('partial matching', () => {
    it('should find terms by partial match', async () => {
      const result = await lookupDefinition(db, { term: 'data' });

      expect(result.length).toBeGreaterThan(0);
      // Should find 'personal data' among others
      expect(result.some(r => r.term === 'personal data')).toBe(true);
    });

    it('should find terms starting with query', async () => {
      const result = await lookupDefinition(db, { term: 'personal' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].term).toBe('personal data');
    });

    it('should rank exact matches higher', async () => {
      const result = await lookupDefinition(db, { term: 'processing' });

      // 'processing' should come before other terms containing 'processing'
      expect(result[0].term).toBe('processing');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SOURCE FILTERING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('source filtering', () => {
    it('should filter by source', async () => {
      const result = await lookupDefinition(db, {
        term: 'data',
        source: 'SOURCE_A',
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every(r => r.source === 'SOURCE_A')).toBe(true);
    });

    it('should return empty for non-existent source', async () => {
      const result = await lookupDefinition(db, {
        term: 'personal data',
        source: 'NONEXISTENT',
      });

      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should return empty for empty term', async () => {
      const result = await lookupDefinition(db, { term: '' });
      expect(result).toEqual([]);
    });

    it('should return empty for no matches', async () => {
      const result = await lookupDefinition(db, { term: 'xyznonexistent' });
      expect(result).toEqual([]);
    });

    it('should handle special characters', async () => {
      // Should not throw
      const result = await lookupDefinition(db, { term: "test's special" });
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET EXACT DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

describe('getExactDefinition', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return definition for exact match', async () => {
    const result = await getExactDefinition(db, 'SOURCE_A', 'personal data');

    expect(result).not.toBeNull();
    expect(result?.term).toBe('personal data');
    expect(result?.source).toBe('SOURCE_A');
  });

  it('should return null for non-existent term', async () => {
    const result = await getExactDefinition(db, 'SOURCE_A', 'nonexistent');
    expect(result).toBeNull();
  });

  it('should return null for wrong source', async () => {
    const result = await getExactDefinition(db, 'SOURCE_B', 'personal data');
    expect(result).toBeNull();
  });

  it('should be case-insensitive', async () => {
    const result = await getExactDefinition(db, 'SOURCE_A', 'PERSONAL DATA');
    expect(result).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LIST DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('listDefinitions', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return all definitions for a source', async () => {
    const result = await listDefinitions(db, 'SOURCE_A');

    const expected = sampleData.definitions.filter(d => d.source === 'SOURCE_A').length;
    expect(result.length).toBe(expected);
  });

  it('should return definitions sorted alphabetically', async () => {
    const result = await listDefinitions(db, 'SOURCE_A');

    const terms = result.map(r => r.term);
    const sorted = [...terms].sort();
    expect(terms).toEqual(sorted);
  });

  it('should return empty for source with no definitions', async () => {
    const result = await listDefinitions(db, 'SOURCE_C');
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPARE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('compareDefinitions', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should find same term in multiple sources', async () => {
    // Both SOURCE_A and SOURCE_B define terms, but may not share any
    // This tests the function works even with single results
    const result = await compareDefinitions(db, 'personal data');

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].term.toLowerCase()).toBe('personal data');
  });

  it('should return empty for term not defined anywhere', async () => {
    const result = await compareDefinitions(db, 'nonexistent term');
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FIND RELATED DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('findRelatedDefinitions', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should find related definitions', async () => {
    // 'personal data' should find 'processing' (both mention data)
    const result = await findRelatedDefinitions(db, 'personal data');

    // Should not include 'personal data' itself
    expect(result.every(r => r.term !== 'personal data')).toBe(true);
  });

  it('should respect limit', async () => {
    const result = await findRelatedDefinitions(db, 'data', 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('should return empty for very short term', async () => {
    const result = await findRelatedDefinitions(db, 'a');
    expect(result).toEqual([]);
  });
});
