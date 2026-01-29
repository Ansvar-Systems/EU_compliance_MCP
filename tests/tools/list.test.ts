import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { listRegulations } from '../../src/tools/list.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('listRegulations', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('lists all available regulations', async () => {
    const result = await listRegulations(db, {});

    expect(result.regulations).toHaveLength(3);
    expect(result.regulations.map(r => r.id)).toContain('GDPR');
    expect(result.regulations.map(r => r.id)).toContain('NIS2');
    expect(result.regulations.map(r => r.id)).toContain('DORA');
  });

  it('includes metadata for each regulation', async () => {
    const result = await listRegulations(db, {});

    const gdpr = result.regulations.find(r => r.id === 'GDPR');
    expect(gdpr).toBeDefined();
    expect(gdpr!.full_name).toBe('General Data Protection Regulation');
    expect(gdpr!.celex_id).toBe('32016R0679');
    expect(gdpr!.article_count).toBeGreaterThan(0);
  });

  it('lists chapters and articles for a specific regulation', async () => {
    const result = await listRegulations(db, {
      regulation: 'GDPR',
    });

    expect(result.regulations).toHaveLength(1);
    expect(result.regulations[0].id).toBe('GDPR');
    expect(result.regulations[0].chapters).toBeDefined();
    expect(result.regulations[0].chapters!.length).toBeGreaterThan(0);
  });

  it('returns empty chapters for unknown regulation', async () => {
    const result = await listRegulations(db, {
      regulation: 'UNKNOWN',
    });

    expect(result.regulations).toHaveLength(0);
  });
});
