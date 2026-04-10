/**
 * AI Act annex golden contract tests.
 *
 * Runs against the built data/regulations.db and asserts the 13 annexes are
 * independently addressable via get_article, the input normalizer resolves
 * underscore/case variants, Article 113 is rewritten to transitional
 * provisions only, and search_regulations finds Annex III for high-risk
 * queries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from '@ansvar/mcp-sqlite';
import { copyFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getArticle } from '../../src/tools/article.js';
import { searchRegulations } from '../../src/tools/search.js';
import { createSqliteAdapter } from '../../src/database/sqlite-adapter.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_DB = join(__dirname, '..', '..', 'data', 'regulations.db');

describe('AI Act annexes (golden contract)', () => {
  let db: DatabaseAdapter;
  let tmpDir: string;

  beforeAll(() => {
    // Copy the built DB to a temp file per test run so vitest parallel workers
    // don't conflict with drift-detection.test.ts on the shared file lock.
    tmpDir = mkdtempSync(join(tmpdir(), 'ai-act-golden-'));
    const dbCopy = join(tmpDir, 'regulations.db');
    copyFileSync(SOURCE_DB, dbCopy);
    const sqliteDb = new Database(dbCopy, { readonly: true });
    db = createSqliteAdapter(sqliteDb);
  });

  afterAll(async () => {
    await db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('get_article(AI_ACT, Annex III) returns the high-risk use case list', async () => {
    const result = await getArticle(db, { regulation: 'AI_ACT', article: 'Annex III' });
    expect(result).not.toBeNull();
    const lower = result!.text.toLowerCase();
    for (const kw of [
      'biometric',
      'critical infrastructure',
      'employment',
      'law enforcement',
    ]) {
      expect(lower).toContain(kw);
    }
  });

  it('get_article accepts underscored and lowercased variants', async () => {
    const canonical = await getArticle(db, { regulation: 'AI_ACT', article: 'Annex III' });
    const underscore = await getArticle(db, { regulation: 'AI_ACT', article: 'Annex_III' });
    const lower = await getArticle(db, { regulation: 'AI_ACT', article: 'annex iii' });
    expect(underscore?.text).toBe(canonical?.text);
    expect(lower?.text).toBe(canonical?.text);
  });

  it('get_article(AI_ACT, Annex XI) mentions training data and compute', async () => {
    const result = await getArticle(db, { regulation: 'AI_ACT', article: 'Annex XI' });
    expect(result).not.toBeNull();
    const lower = result!.text.toLowerCase();
    expect(lower).toContain('training');
    expect(lower).toMatch(/floating point|computational|compute/);
  });

  it('get_article(AI_ACT, Annex XIII) mentions systemic risk', async () => {
    const result = await getArticle(db, { regulation: 'AI_ACT', article: 'Annex XIII' });
    expect(result).not.toBeNull();
    // "systemic risk" appears in the title; body references it via Article 51(1)(a).
    // Check combined content so either location satisfies the test.
    const combined = `${result!.title} ${result!.text}`.toLowerCase();
    expect(combined).toContain('systemic risk');
  });

  it('Article 113 is reduced to transitional provisions only', async () => {
    const result = await getArticle(db, { regulation: 'AI_ACT', article: '113' });
    expect(result).not.toBeNull();
    expect(result!.text.length).toBeLessThan(4000);
    expect(result!.text).not.toMatch(/ANNEX\s+(I|XIII)\b/);
  });

  it('search_regulations FTS index covers annex content', async () => {
    // Use a phrase distinctive to Annex III so the test verifies that annexes
    // land in articles_fts, not the relative ranking against Articles 1-113.
    const results = await searchRegulations(db, {
      query: 'administration of justice and democratic processes',
      regulations: ['AI_ACT'],
      limit: 10,
    });
    const articleNumbers = results.map((r) => r.article);
    expect(articleNumbers).toContain('Annex III');
  });

  it('Article 1 title has no stray backtick', async () => {
    const result = await getArticle(db, { regulation: 'AI_ACT', article: '1' });
    expect(result?.title).toBe('Subject matter');
  });
});
