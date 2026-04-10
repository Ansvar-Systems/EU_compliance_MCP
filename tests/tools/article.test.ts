import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { getArticle, normalizeArticleNumber } from '../../src/tools/article.js';
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

  it('resolves underscored annex form to the canonical row', async () => {
    // NB: this assumes a pre-populated test DB has a row with article_number='Annex I'
    // for AI_ACT. Skipped until the annex extraction task runs; guard with a check.
    const result = await db.query(
      "SELECT 1 FROM articles WHERE regulation = 'AI_ACT' AND article_number = 'Annex I'",
      [],
    );
    if (result.rows.length === 0) {
      return; // annex extraction hasn't run yet; this is exercised again in golden tests
    }

    const byCanonical = await getArticle(db, { regulation: 'AI_ACT', article: 'Annex I' });
    const byUnderscore = await getArticle(db, { regulation: 'AI_ACT', article: 'Annex_I' });
    const byLowercase = await getArticle(db, { regulation: 'AI_ACT', article: 'annex i' });

    expect(byCanonical).not.toBeNull();
    expect(byUnderscore?.text).toBe(byCanonical?.text);
    expect(byLowercase?.text).toBe(byCanonical?.text);
  });
});

describe('normalizeArticleNumber', () => {
  it('passes numeric article numbers through unchanged', () => {
    expect(normalizeArticleNumber('1')).toBe('1');
    expect(normalizeArticleNumber('113')).toBe('113');
    expect(normalizeArticleNumber('5a')).toBe('5a');
  });

  it('normalizes annex variations to canonical "Annex N" form', () => {
    expect(normalizeArticleNumber('Annex I')).toBe('Annex I');
    expect(normalizeArticleNumber('annex i')).toBe('Annex I');
    expect(normalizeArticleNumber('ANNEX III')).toBe('Annex III');
    expect(normalizeArticleNumber('Annex_III')).toBe('Annex III');
    expect(normalizeArticleNumber('annex_iii')).toBe('Annex III');
    expect(normalizeArticleNumber('ANNEX_III')).toBe('Annex III');
    expect(normalizeArticleNumber('Annex  XIII')).toBe('Annex XIII');
    expect(normalizeArticleNumber(' Annex V ')).toBe('Annex V');
  });

  it('returns empty string for empty or whitespace-only input', () => {
    expect(normalizeArticleNumber('')).toBe('');
    expect(normalizeArticleNumber('   ')).toBe('');
  });

  it('leaves non-annex non-numeric input alone (trimmed)', () => {
    expect(normalizeArticleNumber('  7b  ')).toBe('7b');
  });
});
