/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LIST TOOL TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for the list tool (src/tools/list.ts)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDatabase, closeTestDatabase, sampleData } from '../fixtures/test-db';
import { listSources, getSourceMetadata, getSourceStructure } from '../../src/tools/list';

describe('listSources', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST ALL SOURCES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('list all sources (no filter)', () => {
    it('should return all sources when no filter provided', async () => {
      const result = await listSources(db, {});

      expect(result.sources).toBeDefined();
      expect(result.sources?.length).toBe(sampleData.sources.length);
    });

    it('should return sources with correct structure', async () => {
      const result = await listSources(db, {});

      expect(result.sources).toBeDefined();
      expect(result.sources!.length).toBeGreaterThan(0);

      const first = result.sources![0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('full_name');
      expect(first).toHaveProperty('item_count');
      expect(first).toHaveProperty('definition_count');
    });

    it('should return correct item counts', async () => {
      const result = await listSources(db, {});

      const sourceA = result.sources?.find(s => s.id === 'SOURCE_A');
      const expectedItems = sampleData.items.filter(i => i.source === 'SOURCE_A').length;

      expect(sourceA?.item_count).toBe(expectedItems);
    });

    it('should return correct definition counts', async () => {
      const result = await listSources(db, {});

      const sourceA = result.sources?.find(s => s.id === 'SOURCE_A');
      const expectedDefs = sampleData.definitions.filter(d => d.source === 'SOURCE_A').length;

      expect(sourceA?.definition_count).toBe(expectedDefs);
    });

    it('should include sources with no items', async () => {
      const result = await listSources(db, {});

      const sourceC = result.sources?.find(s => s.id === 'SOURCE_C');
      expect(sourceC).toBeDefined();
      expect(sourceC?.item_count).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST ITEMS IN SOURCE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('list items in source', () => {
    it('should return items when source is specified', async () => {
      const result = await listSources(db, { source: 'SOURCE_A' });

      expect(result.items).toBeDefined();
      expect(result.sources).toBeUndefined();
    });

    it('should return correct number of items', async () => {
      const result = await listSources(db, { source: 'SOURCE_A' });

      const expectedItems = sampleData.items.filter(i => i.source === 'SOURCE_A').length;
      expect(result.items?.length).toBe(expectedItems);
    });

    it('should return items with correct structure', async () => {
      const result = await listSources(db, { source: 'SOURCE_A' });

      expect(result.items!.length).toBeGreaterThan(0);

      const first = result.items![0];
      expect(first).toHaveProperty('item_id');
      expect(first).toHaveProperty('title');
      expect(first).toHaveProperty('parent');
    });

    it('should return distinct parents', async () => {
      const result = await listSources(db, { source: 'SOURCE_A' });

      expect(result.parents).toBeDefined();
      expect(result.parents!.length).toBeGreaterThan(0);

      // Should have unique values
      const unique = new Set(result.parents);
      expect(unique.size).toBe(result.parents!.length);
    });

    it('should return empty for non-existent source', async () => {
      const result = await listSources(db, { source: 'NONEXISTENT' });

      expect(result.items).toEqual([]);
      expect(result.parents).toEqual([]);
    });

    it('should return empty for source with no items', async () => {
      const result = await listSources(db, { source: 'SOURCE_C' });

      expect(result.items).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PARENT FILTERING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('parent filtering', () => {
    it('should filter items by parent', async () => {
      const result = await listSources(db, {
        source: 'SOURCE_A',
        parent: 'Chapter I',
      });

      expect(result.items!.length).toBeGreaterThan(0);
      expect(result.items!.every(i => i.parent === 'Chapter I')).toBe(true);
    });

    it('should return empty for non-existent parent', async () => {
      const result = await listSources(db, {
        source: 'SOURCE_A',
        parent: 'Chapter NONEXISTENT',
      });

      expect(result.items).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET SOURCE METADATA
// ═══════════════════════════════════════════════════════════════════════════

describe('getSourceMetadata', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return metadata for existing source', async () => {
    const result = await getSourceMetadata(db, 'SOURCE_A');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('SOURCE_A');
    expect(result?.full_name).toBe('Test Source Alpha');
  });

  it('should return null for non-existent source', async () => {
    const result = await getSourceMetadata(db, 'NONEXISTENT');
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET SOURCE STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

describe('getSourceStructure', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return hierarchical structure', async () => {
    const result = await getSourceStructure(db, 'SOURCE_A');

    expect(result.source).toBe('SOURCE_A');
    expect(result.chapters).toBeDefined();
    expect(result.chapters.length).toBeGreaterThan(0);
  });

  it('should group items by chapter', async () => {
    const result = await getSourceStructure(db, 'SOURCE_A');

    const chapterI = result.chapters.find(c => c.name === 'Chapter I');
    expect(chapterI).toBeDefined();
    expect(chapterI!.items.length).toBeGreaterThan(0);
  });

  it('should include items without parents', async () => {
    const result = await getSourceStructure(db, 'SOURCE_A');

    // Item 99 has null parent
    const noParent = result.chapters.find(c => c.name === '(No Chapter)');
    expect(noParent).toBeDefined();
    expect(noParent!.items.some(i => i.item_id === '99')).toBe(true);
  });
});
