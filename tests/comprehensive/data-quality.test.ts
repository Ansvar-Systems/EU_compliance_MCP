/**
 * Data Quality & Integrity Tests
 * Ensures database consistency and referential integrity
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type { Database } from 'better-sqlite3';

describe('Data Quality & Integrity', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('articles table count matches FTS5 index', () => {
    const articlesCount = db
      .prepare('SELECT COUNT(*) as count FROM articles')
      .get() as { count: number };
    const ftsCount = db
      .prepare('SELECT COUNT(*) as count FROM articles_fts')
      .get() as { count: number };

    expect(articlesCount.count).toBe(ftsCount.count);
    expect(articlesCount.count).toBeGreaterThan(0); // Test DB has 14 articles
  });

  it('verifies recitals exist for regulations that have them', () => {
    const regulationsWithRecitals = db
      .prepare('SELECT DISTINCT regulation FROM recitals')
      .all();

    // Test DB has 3 regulations with recitals (GDPR, NIS2, DORA)
    expect(regulationsWithRecitals.length).toBeGreaterThan(0);

    // Verify recitals have valid regulation references
    const orphanedRecitals = db
      .prepare(`
        SELECT r.regulation
        FROM recitals r
        LEFT JOIN regulations reg ON r.regulation = reg.id
        WHERE reg.id IS NULL
      `)
      .all();

    expect(orphanedRecitals).toHaveLength(0);
  });

  it('definitions reference valid regulations', () => {
    const definitions = db.prepare('SELECT * FROM definitions').all() as Array<{
      regulation: string;
      term: string;
      article: string;
    }>;

    expect(definitions.length).toBeGreaterThan(0);

    // Verify regulations exist (even if articles might not in test fixture)
    for (const def of definitions) {
      const regExists = db.prepare('SELECT id FROM regulations WHERE id = ?').get(def.regulation);
      expect(regExists).toBeDefined();
    }
  });

  it('control mappings have valid structure', () => {
    const mappings = db
      .prepare('SELECT * FROM control_mappings LIMIT 10')
      .all() as Array<{
        regulation: string;
        articles: string;
        framework: string;
        control_id: string;
        coverage: string;
      }>;

    expect(mappings.length).toBeGreaterThan(0);

    for (const mapping of mappings) {
      // Verify regulation exists
      const regExists = db.prepare('SELECT id FROM regulations WHERE id = ?').get(mapping.regulation);
      expect(regExists).toBeDefined();

      // Verify articles field is valid JSON array
      const articles = JSON.parse(mapping.articles) as string[];
      expect(Array.isArray(articles)).toBe(true);
      expect(articles.length).toBeGreaterThan(0);

      // Verify coverage is valid
      expect(['full', 'partial', 'related']).toContain(mapping.coverage);
    }
  });

  it('all regulations table entries are valid', () => {
    const regulations = db.prepare('SELECT * FROM regulations').all() as Array<{
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

  it('no duplicate articles for same regulation', () => {
    const duplicates = db
      .prepare(
        `
        SELECT regulation, article_number, COUNT(*) as count
        FROM articles
        GROUP BY regulation, article_number
        HAVING count > 1
      `
      )
      .all();

    expect(duplicates).toHaveLength(0);
  });

  it('all regulations have at least one article', () => {
    const regulationsWithoutArticles = db
      .prepare(
        `
        SELECT r.id
        FROM regulations r
        LEFT JOIN articles a ON r.id = a.regulation
        WHERE a.rowid IS NULL
      `
      )
      .all();

    expect(regulationsWithoutArticles).toHaveLength(0);
  });

  it('FTS5 index contains same text as articles table', () => {
    const randomArticle = db
      .prepare('SELECT rowid, text FROM articles ORDER BY RANDOM() LIMIT 1')
      .get() as { rowid: number; text: string };

    const ftsEntry = db
      .prepare('SELECT text FROM articles_fts WHERE rowid = ?')
      .get(randomArticle.rowid) as { text: string };

    expect(ftsEntry.text).toBe(randomArticle.text);
  });

  it('applicability rules reference valid regulations', () => {
    const rules = db.prepare('SELECT DISTINCT regulation FROM applicability_rules').all() as Array<{
      regulation: string;
    }>;

    // Test DB has applicability rules
    expect(rules.length).toBeGreaterThan(0);

    for (const rule of rules) {
      const regExists = db.prepare('SELECT id FROM regulations WHERE id = ?').get(rule.regulation);
      expect(regExists).toBeDefined();
    }
  });

  it('control mappings have valid framework types', () => {
    const frameworks = db
      .prepare('SELECT DISTINCT framework FROM control_mappings')
      .all() as Array<{ framework: string }>;

    const validFrameworks = ['ISO27001', 'NIST_CSF'];

    for (const fw of frameworks) {
      expect(validFrameworks).toContain(fw.framework);
    }
  });
});
