import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import {
  searchGuidance,
  getGuidanceSection,
  listGuidance,
} from '../../src/tools/guidance.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('searchGuidance', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('finds sections matching a cybersecurity query', async () => {
    const results = await searchGuidance(db, {
      query: 'cybersecurity risk management',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].document_reference).toContain('MDCG');
  });

  it('filters by document_id', async () => {
    const results = await searchGuidance(db, {
      query: 'cybersecurity',
      document_id: 'MDCG_2019_16',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.document_id === 'MDCG_2019_16')).toBe(true);
  });

  it('filters by issuing_body', async () => {
    const results = await searchGuidance(db, {
      query: 'medical device',
      issuing_body: 'MDCG',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.issuing_body === 'MDCG')).toBe(true);
  });

  it('filters by related_regulation', async () => {
    const results = await searchGuidance(db, {
      query: 'software classification',
      related_regulation: 'MDR',
    });

    // Should match MDCG_2019_16 (MDR) and MDCG_2019_11 (both)
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) => {
      expect(['MDR', 'both']).toContain(r.related_regulation);
    });
  });

  it('respects limit parameter', async () => {
    const results = await searchGuidance(db, {
      query: 'device',
      limit: 2,
    });

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for no matches', async () => {
    const results = await searchGuidance(db, {
      query: 'xyznonexistent123',
    });

    expect(results).toHaveLength(0);
  });

  // ── Missing / wrong-type query guard (2026-04-20 audit) ──────────────
  // escapeFts5Query(query) calls query.replace(); pre-fix this crashed
  // with "Cannot read properties of undefined (reading 'replace')" when
  // query was omitted or passed as a non-string. Same class of bug as
  // get_definitions — schema marks query required, SDK doesn't enforce.
  it('throws a clear error when query is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(searchGuidance(db, {} as any)).rejects.toThrow(/query is required/i);
  });

  it('throws a clear error when query is not a string', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      searchGuidance(db, { query: 42 as any }),
    ).rejects.toThrow(/query is required/i);
  });
});

describe('getGuidanceSection', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('returns section with document metadata', async () => {
    const section = await getGuidanceSection(db, {
      document_id: 'MDCG_2019_16',
      section_number: '3',
    });

    expect(section).not.toBeNull();
    expect(section!.title).toBe('Pre-market Cybersecurity Requirements');
    expect(section!.document_reference).toBe('MDCG 2019-16 rev.1');
    expect(section!.related_regulation).toBe('MDR');
    expect(section!.issuing_body).toBe('MDCG');
    expect(section!.content).toContain('risk management');
  });

  it('returns subsection with parent reference', async () => {
    const section = await getGuidanceSection(db, {
      document_id: 'MDCG_2019_16',
      section_number: '3.1',
    });

    expect(section).not.toBeNull();
    expect(section!.title).toBe('Threat Modeling');
    expect(section!.parent_section).toBe('3');
  });

  it('returns null for nonexistent section', async () => {
    const section = await getGuidanceSection(db, {
      document_id: 'MDCG_2019_16',
      section_number: '99',
    });

    expect(section).toBeNull();
  });

  it('returns null for nonexistent document', async () => {
    const section = await getGuidanceSection(db, {
      document_id: 'NONEXISTENT',
      section_number: '1',
    });

    expect(section).toBeNull();
  });
});

describe('listGuidance', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('lists all guidance documents', async () => {
    const docs = await listGuidance(db, {});

    expect(docs.length).toBe(3);
    expect(docs.every((d) => d.issuing_body === 'MDCG')).toBe(true);
  });

  it('includes section counts', async () => {
    const docs = await listGuidance(db, {});

    const cybersecDoc = docs.find((d) => d.id === 'MDCG_2019_16');
    expect(cybersecDoc).toBeDefined();
    expect(cybersecDoc!.section_count).toBe(5); // sections 1, 3, 3.1, 3.2, 4
  });

  it('filters by related regulation', async () => {
    const docs = await listGuidance(db, { related_regulation: 'MDR' });

    // MDCG_2019_16 is MDR, MDCG_2019_11 and MDCG_2020_1 are 'both'
    expect(docs.length).toBe(3);
  });

  it('filters by issuing body', async () => {
    const docs = await listGuidance(db, { issuing_body: 'MDCG' });
    expect(docs.length).toBe(3);

    const docsEdpb = await listGuidance(db, { issuing_body: 'EDPB' });
    expect(docsEdpb.length).toBe(0);
  });
});
