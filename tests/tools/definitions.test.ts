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

  it('throws a clear error when term is missing', async () => {
    // Reproduces the crash observed in production on 2026-04-20:
    // get_definitions({regulation: "GDPR"}) (term omitted) surfaced as
    // "Cannot read properties of undefined (reading 'replace')" — a stack
    // trace from inside the LIKE-wildcard escape. The schema marks term
    // required, but the MCP SDK passes the args through unvalidated, so
    // the handler must guard the contract itself.
    await expect(getDefinitions(db, {} as { term: string })).rejects.toThrow(
      /term is required/i,
    );
  });

  it('throws a clear error when term is not a string', async () => {
    // Defensive: guards against callers that pass a number, null, or
    // object through MCP arguments — the LIKE-escape would have crashed
    // on any non-string that lacks ``.replace()``.
    await expect(
      getDefinitions(db, { term: 42 as unknown as string }),
    ).rejects.toThrow(/term is required/i);
    await expect(
      getDefinitions(db, { term: null as unknown as string }),
    ).rejects.toThrow(/term is required/i);
  });
});
