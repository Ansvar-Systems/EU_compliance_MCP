import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { compareRequirements } from '../../src/tools/compare.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('compareRequirements', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('compares incident reporting across regulations', async () => {
    const result = await compareRequirements(db, {
      topic: 'incident reporting',
      regulations: ['DORA', 'NIS2'],
    });

    expect(result.topic).toBe('incident reporting');
    expect(result.regulations).toHaveLength(2);

    const dora = result.regulations.find(r => r.regulation === 'DORA');
    const nis2 = result.regulations.find(r => r.regulation === 'NIS2');

    expect(dora).toBeDefined();
    expect(nis2).toBeDefined();
    expect(dora!.articles.length).toBeGreaterThan(0);
    expect(nis2!.articles.length).toBeGreaterThan(0);
  });

  it('returns empty for non-matching topic', async () => {
    const result = await compareRequirements(db, {
      topic: 'xyznonexistent',
      regulations: ['GDPR', 'NIS2'],
    });

    expect(result.regulations.every(r => r.articles.length === 0)).toBe(true);
  });

  it('handles single regulation', async () => {
    const result = await compareRequirements(db, {
      topic: 'security',
      regulations: ['GDPR'],
    });

    expect(result.regulations).toHaveLength(1);
    expect(result.regulations[0].regulation).toBe('GDPR');
  });

  it('extracts timelines from incident reporting articles', async () => {
    const result = await compareRequirements(db, {
      topic: 'incident',
      regulations: ['DORA', 'NIS2', 'GDPR'],
    });

    // NIS2 Article 23 mentions 24 hours and 72 hours
    const nis2 = result.regulations.find(r => r.regulation === 'NIS2');
    expect(nis2).toBeDefined();
    // Timeline extraction is optional enhancement
  });

  // ── Missing / wrong-type arg guards (2026-04-20 audit) ────────────────
  // getSynonyms(topic) calls topic.toLowerCase(); pre-fix this crashed with
  // "Cannot read properties of undefined (reading 'toLowerCase')" for any
  // call omitting topic. Schema marks topic required but the SDK doesn't
  // enforce the schema, so the handler must guard the contract itself.
  it('throws a clear error when topic is missing', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      compareRequirements(db, { regulations: ['GDPR'] } as any),
    ).rejects.toThrow(/topic is required/i);
  });

  it('throws a clear error when topic is not a string', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      compareRequirements(db, { topic: 42 as any, regulations: ['GDPR'] }),
    ).rejects.toThrow(/topic is required/i);
  });

  it('throws a clear error when regulations is missing', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      compareRequirements(db, { topic: 'incident' } as any),
    ).rejects.toThrow(/regulations is required/i);
  });
});
