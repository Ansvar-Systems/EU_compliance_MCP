import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { getRecital } from '../../src/tools/recital.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('getRecital', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('should retrieve a specific recital by regulation and number', async () => {
    const result = await getRecital(db, {
      regulation: 'GDPR',
      recital_number: 83,
    });

    expect(result).toBeDefined();
    expect(result!.regulation).toBe('GDPR');
    expect(result!.recital_number).toBe(83);
    expect(result!.text).toContain('security');
  });

  it('should return null for non-existent recital number', async () => {
    const result = await getRecital(db, {
      regulation: 'GDPR',
      recital_number: 9999,
    });

    expect(result).toBeNull();
  });

  it('should retrieve different recital from same regulation', async () => {
    const result = await getRecital(db, {
      regulation: 'GDPR',
      recital_number: 1,
    });

    expect(result).toBeDefined();
    expect(result!.regulation).toBe('GDPR');
    expect(result!.recital_number).toBe(1);
  });

  it('should return null for non-existent regulation', async () => {
    const result = await getRecital(db, {
      regulation: 'FAKE_REG',
      recital_number: 1,
    });

    expect(result).toBeNull();
  });

  it('should include related_articles when available', async () => {
    const result = await getRecital(db, {
      regulation: 'GDPR',
      recital_number: 1,
    });

    expect(result).toBeDefined();
    // related_articles may be null in test data, that's okay
    expect(result).toHaveProperty('related_articles');
  });

  it('exposes a recital-specific ELI URL as _citation.source_url', async () => {
    // Mirror of the get_article fix for recitals — the builder appends a
    // #rct_N anchor so a gateway consumer clicking the citation chip lands
    // on the recital rather than the top of the regulation.
    const result = await getRecital(db, { regulation: 'GDPR', recital_number: 83 });
    expect(result).not.toBeNull();
    expect(result!._citation?.source_url).toBe(
      'https://eur-lex.europa.eu/eli/reg/2016/679/oj#rct_83',
    );
  });

  it('maps directives to their ELI type (dir) for the recital URL', async () => {
    const result = await getRecital(db, { regulation: 'NIS2', recital_number: 1 });
    expect(result).not.toBeNull();
    expect(result!._citation?.source_url).toBe(
      'https://eur-lex.europa.eu/eli/dir/2022/2555/oj#rct_1',
    );
  });
});
