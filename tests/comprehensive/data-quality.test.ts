/**
 * Data Quality & Integrity Tests
 * Ensures database consistency and referential integrity
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('Data Quality & Integrity', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('articles table count matches FTS5 index', async () => {
    const articlesResult = await db.query('SELECT COUNT(*) as count FROM articles');
    const ftsResult = await db.query('SELECT COUNT(*) as count FROM articles_fts');

    const articlesCount = articlesResult.rows[0] as { count: number };
    const ftsCount = ftsResult.rows[0] as { count: number };

    expect(articlesCount.count).toBe(ftsCount.count);
    expect(articlesCount.count).toBeGreaterThan(0); // Test DB has 14 articles
  });

  it('verifies recitals exist for regulations that have them', async () => {
    const result = await db.query('SELECT DISTINCT regulation FROM recitals');
    const regulationsWithRecitals = result.rows;

    // Test DB has 3 regulations with recitals (GDPR, NIS2, DORA)
    expect(regulationsWithRecitals.length).toBeGreaterThan(0);

    // Verify recitals have valid regulation references
    const orphanedResult = await db.query(`
        SELECT r.regulation
        FROM recitals r
        LEFT JOIN regulations reg ON r.regulation = reg.id
        WHERE reg.id IS NULL
      `);

    expect(orphanedResult.rows).toHaveLength(0);
  });

  it('definitions reference valid regulations', async () => {
    const result = await db.query('SELECT * FROM definitions');
    const definitions = result.rows as Array<{
      regulation: string;
      term: string;
      article: string;
    }>;

    expect(definitions.length).toBeGreaterThan(0);

    // Verify regulations exist (even if articles might not in test fixture)
    for (const def of definitions) {
      const regResult = await db.query('SELECT id FROM regulations WHERE id = $1', [def.regulation]);
      expect(regResult.rows[0]).toBeDefined();
    }
  });

  it('control mappings have valid structure', async () => {
    const result = await db.query('SELECT * FROM control_mappings LIMIT 10');
    const mappings = result.rows as Array<{
        regulation: string;
        articles: string;
        framework: string;
        control_id: string;
        coverage: string;
      }>;

    expect(mappings.length).toBeGreaterThan(0);

    for (const mapping of mappings) {
      // Verify regulation exists
      const regResult = await db.query('SELECT id FROM regulations WHERE id = $1', [mapping.regulation]);
      expect(regResult.rows[0]).toBeDefined();

      // Verify articles field is valid JSON array
      const articles = JSON.parse(mapping.articles) as string[];
      expect(Array.isArray(articles)).toBe(true);
      expect(articles.length).toBeGreaterThan(0);

      // Verify coverage is valid
      expect(['full', 'partial', 'related']).toContain(mapping.coverage);
    }
  });

  it('all regulations table entries are valid', async () => {
    const result = await db.query('SELECT * FROM regulations');
    const regulations = result.rows as Array<{
      id: string;
      full_name: string;
      celex_id: string;
    }>;

    // Test DB has 3 regulations (GDPR, NIS2, DORA)
    expect(regulations.length).toBeGreaterThan(0);

    // All should have required fields
    for (const reg of regulations) {
      expect(reg.id).toBeTruthy();
      expect(reg.full_name).toBeTruthy();
      expect(reg.celex_id).toBeTruthy();
    }
  });

  it('no duplicate articles for same regulation', async () => {
    const result = await db.query(
        `
        SELECT regulation, article_number, COUNT(*) as count
        FROM articles
        GROUP BY regulation, article_number
        HAVING count > 1
      `
      );

    expect(result.rows).toHaveLength(0);
  });

  it('all regulations have at least one article', async () => {
    const result = await db.query(
        `
        SELECT r.id
        FROM regulations r
        LEFT JOIN articles a ON r.id = a.regulation
        WHERE a.rowid IS NULL
      `
      );

    expect(result.rows).toHaveLength(0);
  });

  it('FTS5 index contains same text as articles table', async () => {
    const articleResult = await db.query('SELECT rowid, text FROM articles ORDER BY RANDOM() LIMIT 1');
    const randomArticle = articleResult.rows[0] as { rowid: number; text: string };

    const ftsResult = await db.query('SELECT text FROM articles_fts WHERE rowid = $1', [randomArticle.rowid]);
    const ftsEntry = ftsResult.rows[0] as { text: string };

    expect(ftsEntry.text).toBe(randomArticle.text);
  });

  it('applicability rules reference valid regulations', async () => {
    const result = await db.query('SELECT DISTINCT regulation FROM applicability_rules');
    const rules = result.rows as Array<{
      regulation: string;
    }>;

    // Test DB has applicability rules
    expect(rules.length).toBeGreaterThan(0);

    for (const rule of rules) {
      const regResult = await db.query('SELECT id FROM regulations WHERE id = $1', [rule.regulation]);
      expect(regResult.rows[0]).toBeDefined();
    }
  });

  it('control mappings have valid framework types', async () => {
    const result = await db.query('SELECT DISTINCT framework FROM control_mappings');
    const frameworks = result.rows as Array<{ framework: string }>;

    const validFrameworks = ['ISO27001', 'NIST_CSF'];

    for (const fw of frameworks) {
      expect(validFrameworks).toContain(fw.framework);
    }
  });
});
