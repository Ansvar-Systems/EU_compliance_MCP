import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { getRecital } from '../../src/tools/recital.js';
import type { Database } from 'better-sqlite3';

describe('getRecital', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
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
});
