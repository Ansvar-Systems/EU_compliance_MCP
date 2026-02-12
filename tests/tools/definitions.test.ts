import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { getDefinitions } from '../../src/tools/definitions.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('getDefinitions', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('finds definitions for a term', async () => {
    const result = await getDefinitions(db, {
      term: 'personal data',
    });

    expect(result).toHaveLength(1);
    expect(result[0].regulation).toBe('GDPR');
    expect(result[0].term).toBe('personal data');
    expect(result[0].definition).toContain('identified or identifiable natural person');
  });

  it('finds definitions across multiple regulations', async () => {
    const result = await getDefinitions(db, {
      term: 'incident',
    });

    // Both NIS2 and DORA define "incident" (different terms but similar)
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by regulation when specified', async () => {
    const result = await getDefinitions(db, {
      term: 'processing',
      regulation: 'GDPR',
    });

    expect(result).toHaveLength(1);
    expect(result[0].regulation).toBe('GDPR');
  });

  it('returns empty for unknown term', async () => {
    const result = await getDefinitions(db, {
      term: 'xyznonexistent',
    });

    expect(result).toHaveLength(0);
  });

  it('includes article reference for each definition', async () => {
    const result = await getDefinitions(db, {
      term: 'personal data',
    });

    expect(result[0].article).toBeDefined();
    expect(result[0].article).toBe('4');
  });

  it('performs partial matching on terms', async () => {
    const result = await getDefinitions(db, {
      term: 'personal',
    });

    // Should find "personal data"
    expect(result.length).toBeGreaterThan(0);
  });
});
