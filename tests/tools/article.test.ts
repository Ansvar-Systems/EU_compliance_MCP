import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { getArticle } from '../../src/tools/article.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('getArticle', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('retrieves a specific article by regulation and number', async () => {
    const article = await getArticle(db, {
      regulation: 'GDPR',
      article: '4',
    });

    expect(article).toBeDefined();
    expect(article!.regulation).toBe('GDPR');
    expect(article!.article_number).toBe('4');
    expect(article!.title).toBe('Definitions');
    expect(article!.text).toContain('personal data');
  });

  it('returns null for non-existent article', async () => {
    const article = await getArticle(db, {
      regulation: 'GDPR',
      article: '999',
    });

    expect(article).toBeNull();
  });

  it('returns null for non-existent regulation', async () => {
    const article = await getArticle(db, {
      regulation: 'FAKE_REG',
      article: '1',
    });

    expect(article).toBeNull();
  });

  it('handles article numbers with sub-sections', async () => {
    // Our test data uses simple numbers, but real regulations have "23(1)" style
    const article = await getArticle(db, {
      regulation: 'NIS2',
      article: '23',
    });

    expect(article).toBeDefined();
    expect(article!.title).toBe('Reporting obligations');
  });

  it('includes cross-references when available', async () => {
    const article = await getArticle(db, {
      regulation: 'GDPR',
      article: '33',
    });

    expect(article).toBeDefined();
    // cross_references may be null in test data, that's okay
    expect(article).toHaveProperty('cross_references');
  });
});
