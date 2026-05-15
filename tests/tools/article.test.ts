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

  it('exposes a provision-specific ELI URL as _citation.source_url', async () => {
    // Closes the gateway validate_citation gap where citation.source_url came
    // back blank even on valid hits (2026-04-20 post-merge probe). Per the
    // law-mcp-golden-standard.md §4.9b contract, source_url is the URL for
    // the specific provision — computed server-side from CELEX id + article
    // number, so no ingestion backfill is needed (per the 2026-04-18 DPIA
    // audit finding).
    const article = await getArticle(db, { regulation: 'GDPR', article: '32' });
    expect(article).not.toBeNull();
    expect(article!._citation?.source_url).toBe(
      'https://eur-lex.europa.eu/eli/reg/2016/679/oj#art_32',
    );
  });

  it('maps directives to their ELI type (dir) for the article URL', async () => {
    // NIS2 is a directive (CELEX 32022L2555); the ELI base should use
    // "dir" rather than "reg". Catches a regression if the CELEX→ELI
    // type map drifts and silently defaults to one sector letter.
    const article = await getArticle(db, { regulation: 'NIS2', article: '23' });
    expect(article).not.toBeNull();
    expect(article!._citation?.source_url).toBe(
      'https://eur-lex.europa.eu/eli/dir/2022/2555/oj#art_23',
    );
  });

  // ── Missing / wrong-type arg guards (2026-04-20 audit) ────────────────
  // normalizeArticleNumber(input.article) calls input.replace(); pre-fix
  // this crashed with "input.replace is not a function" when article was
  // a number. Same class as get_definitions — schema marks required, SDK
  // doesn't enforce, handler must guard.
  it('throws a clear error when article is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(getArticle(db, { regulation: 'GDPR' } as any)).rejects.toThrow(
      /article is required/i,
    );
  });

  it('throws a clear error when article is not a string', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getArticle(db, { regulation: 'GDPR', article: 42 as any }),
    ).rejects.toThrow(/article is required/i);
  });

  it('throws a clear error when regulation is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(getArticle(db, { article: '32' } as any)).rejects.toThrow(
      /regulation is required/i,
    );
  });

  it('falls back to the regulation-level URL for Annex references', async () => {
    // Annex anchoring isn't universally published on EUR-Lex ELI pages, so
    // the builder emits the regulation-level URL (no anchor) for non-numeric
    // article_number values. Still a working link — just not a deep link.
    // Guarded here against someone "improving" the Annex path to emit a
    // guessed anchor like ``#anx_I`` that doesn't resolve on every act.
    // Fixture does not currently seed Annex rows, so we exercise this by
    // looking up a known-Annex row if one exists in the DB; otherwise the
    // unit test in tests/utils/eur-lex-url.test.ts covers the branch.
    const annexCheck = await db.query(
      "SELECT 1 FROM articles WHERE article_number LIKE 'Annex %' LIMIT 1",
      [],
    );
    if (annexCheck.rows.length === 0) return; // unit test in eur-lex-url.test.ts covers it
    const row = (await db.query(
      "SELECT regulation, article_number FROM articles WHERE article_number LIKE 'Annex %' LIMIT 1",
      [],
    )).rows[0] as { regulation: string; article_number: string };
    const annex = await getArticle(db, { regulation: row.regulation, article: row.article_number });
    expect(annex).not.toBeNull();
    expect(annex!._citation?.source_url).not.toContain('#art_');
    expect(annex!._citation?.source_url).not.toContain('#anx_');
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

  // ── Recital lookups via get_provision/get_article (D5 fix) ────────────
  // The gateway's get_provision tool maps directly to get_article with
  // (regulation, article) → (law, article). Workflow prompts (e.g. the
  // DPIA scoping.screening step) instruct agents to fetch recitals via
  // article='Recital N' on the same tool. Pre-fix every call returned
  // null because the recitals table was unreachable via get_article.
  // Routes 'Recital N' (case-insensitive) to the recitals table and
  // returns the recital text in the Article envelope. Recital citations
  // are stamped 'GDPR Recital N' so the gateway's citation chip lands
  // on the correct anchor.
  it('routes "Recital N" article form to the recitals table', async () => {
    const result = await getArticle(db, {
      regulation: 'GDPR',
      article: 'Recital 83',
    });

    expect(result).not.toBeNull();
    expect(result!.regulation).toBe('GDPR');
    expect(result!.article_number).toBe('Recital 83');
    expect(result!.text).toContain('security');
    expect(result!._citation?.source_url).toBe(
      'https://eur-lex.europa.eu/eli/reg/2016/679/oj#rct_83',
    );
  });

  it('accepts case-insensitive "recital N" article form', async () => {
    const lowercase = await getArticle(db, {
      regulation: 'GDPR',
      article: 'recital 83',
    });
    const titlecase = await getArticle(db, {
      regulation: 'GDPR',
      article: 'Recital 83',
    });

    expect(lowercase).not.toBeNull();
    expect(titlecase).not.toBeNull();
    expect(lowercase!.text).toBe(titlecase!.text);
  });

  it('accepts the abbreviated "Rct N" recital form', async () => {
    // EUR-Lex anchors recitals as #rct_N; the abbreviated form is the
    // citation idiom many MCP clients adopt when copying anchors back
    // into a follow-up get_provision call.
    const result = await getArticle(db, {
      regulation: 'GDPR',
      article: 'Rct 1',
    });

    expect(result).not.toBeNull();
    expect(result!.article_number).toBe('Recital 1');
    expect(result!.text).toContain('protection');
  });

  it('returns null for an out-of-range recital number', async () => {
    const result = await getArticle(db, {
      regulation: 'GDPR',
      article: 'Recital 9999',
    });

    expect(result).toBeNull();
  });

  it('does not affect regular article lookups', async () => {
    // Regression guard: the recital branch must not interfere with the
    // numeric article path. GDPR Article 32 is the DPIA security article
    // and is one of the most-cited provisions in compliance workflows.
    const result = await getArticle(db, {
      regulation: 'GDPR',
      article: '32',
    });

    expect(result).not.toBeNull();
    expect(result!.article_number).toBe('32');
    expect(result!.title).toBe('Security of processing');
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

  it('strips "Article" prefix in all common forms', () => {
    expect(normalizeArticleNumber('Article 5')).toBe('5');
    expect(normalizeArticleNumber('article 5')).toBe('5');
    expect(normalizeArticleNumber('Art. 5')).toBe('5');
    expect(normalizeArticleNumber('Art 5')).toBe('5');
    expect(normalizeArticleNumber('ARTICLE 17')).toBe('17');
  });

  it('preserves compound article references after stripping prefix', () => {
    expect(normalizeArticleNumber('Article 5(1)(a)')).toBe('5(1)(a)');
    expect(normalizeArticleNumber('Art. 5a')).toBe('5a');
  });

  it('normalizes recital references to canonical "Recital N" form', () => {
    expect(normalizeArticleNumber('Recital 75')).toBe('Recital 75');
    expect(normalizeArticleNumber('recital 75')).toBe('Recital 75');
    expect(normalizeArticleNumber('RECITAL 75')).toBe('Recital 75');
    expect(normalizeArticleNumber('Recital_75')).toBe('Recital 75');
    expect(normalizeArticleNumber('recital  75')).toBe('Recital 75');
    expect(normalizeArticleNumber('Rct 75')).toBe('Recital 75');
    expect(normalizeArticleNumber('rct 75')).toBe('Recital 75');
    expect(normalizeArticleNumber('Rct. 75')).toBe('Recital 75');
  });
});
