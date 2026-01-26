/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GET ITEM TOOL TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for the get-item tool (src/tools/get-item.ts)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDatabase, closeTestDatabase, getSampleItem } from '../fixtures/test-db';
import { getItem, getItems } from '../../src/tools/get-item';

describe('getItem', () => {
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
    it('should return an item that exists', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_A',
        item_id: '1',
      });

      expect(result).not.toBeNull();
      expect(result?.source).toBe('SOURCE_A');
      expect(result?.item_id).toBe('1');
    });

    it('should return full item data', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_A',
        item_id: '1',
      });

      expect(result).toMatchObject({
        source: 'SOURCE_A',
        item_id: '1',
        title: expect.any(String),
        text: expect.any(String),
      });
    });

    it('should return item with correct text', async () => {
      const expected = getSampleItem('SOURCE_A', '1');
      const result = await getItem(db, {
        source: 'SOURCE_A',
        item_id: '1',
      });

      expect(result?.text).toBe(expected?.text);
    });

    it('should return item with parent', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_A',
        item_id: '1',
      });

      expect(result?.parent).toBe('Chapter I');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NOT FOUND
  // ═══════════════════════════════════════════════════════════════════════════

  describe('not found cases', () => {
    it('should return null for non-existent item', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_A',
        item_id: '999',
      });

      expect(result).toBeNull();
    });

    it('should return null for non-existent source', async () => {
      const result = await getItem(db, {
        source: 'NONEXISTENT',
        item_id: '1',
      });

      expect(result).toBeNull();
    });

    it('should return null when source exists but item does not', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_C', // Exists but has no items
        item_id: '1',
      });

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NULL HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('null value handling', () => {
    it('should handle item with null title', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_A',
        item_id: '4',
      });

      expect(result).not.toBeNull();
      expect(result?.title).toBeNull();
    });

    it('should handle item with null parent', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_A',
        item_id: '99',
      });

      expect(result).not.toBeNull();
      expect(result?.parent).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSECTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subsection handling', () => {
    it('should find items with subsection IDs', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_B',
        item_id: '4(1)',
      });

      expect(result).not.toBeNull();
      expect(result?.item_id).toBe('4(1)');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('input validation', () => {
    it('should throw for empty source', async () => {
      await expect(
        getItem(db, { source: '', item_id: '1' })
      ).rejects.toThrow('source is required');
    });

    it('should throw for empty item_id', async () => {
      await expect(
        getItem(db, { source: 'SOURCE_A', item_id: '' })
      ).rejects.toThrow('item_id is required');
    });

    it('should trim whitespace from source', async () => {
      const result = await getItem(db, {
        source: '  SOURCE_A  ',
        item_id: '1',
      });

      expect(result).not.toBeNull();
    });

    it('should trim whitespace from item_id', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_A',
        item_id: '  1  ',
      });

      expect(result).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATED ITEMS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('include_related option', () => {
    it('should not include related by default', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_A',
        item_id: '1',
      });

      expect(result?.related).toBeNull();
    });

    it('should include related when requested', async () => {
      const result = await getItem(db, {
        source: 'SOURCE_A',
        item_id: '1',
        include_related: true,
      });

      // Even if no related items, should return null (not undefined)
      expect(result?.related === null || Array.isArray(result?.related)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GET ITEMS
// ═══════════════════════════════════════════════════════════════════════════

describe('getItems (batch)', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return multiple items', async () => {
    const result = await getItems(db, [
      { source: 'SOURCE_A', item_id: '1' },
      { source: 'SOURCE_A', item_id: '2' },
    ]);

    expect(result.length).toBe(2);
    expect(result[0]?.item_id).toBe('1');
    expect(result[1]?.item_id).toBe('2');
  });

  it('should preserve order and handle missing items', async () => {
    const result = await getItems(db, [
      { source: 'SOURCE_A', item_id: '1' },
      { source: 'SOURCE_A', item_id: '999' }, // Does not exist
      { source: 'SOURCE_A', item_id: '2' },
    ]);

    expect(result.length).toBe(3);
    expect(result[0]?.item_id).toBe('1');
    expect(result[1]).toBeNull();
    expect(result[2]?.item_id).toBe('2');
  });

  it('should handle empty array', async () => {
    const result = await getItems(db, []);
    expect(result).toEqual([]);
  });
});
