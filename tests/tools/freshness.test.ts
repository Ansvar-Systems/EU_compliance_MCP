import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from '@ansvar/mcp-sqlite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkDataFreshness } from '../../src/tools/freshness.js';
import { createSqliteAdapter } from '../../src/database/sqlite-adapter.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('check_data_freshness guidance block', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    const raw = new Database(':memory:');
    // Apply guidance schema.
    const guidanceSchema = readFileSync(
      join(__dirname, '..', '..', 'scripts', 'add-guidance-tables.sql'),
      'utf-8',
    );
    raw.exec(guidanceSchema);

    // Apply source_registry schema (slim subset of the real DDL).
    raw.exec(`
      CREATE TABLE IF NOT EXISTS source_registry (
        regulation TEXT PRIMARY KEY,
        celex_id TEXT,
        eur_lex_version TEXT,
        last_fetched TEXT,
        articles_expected INTEGER,
        articles_parsed INTEGER,
        quality_status TEXT,
        notes TEXT
      );
    `);

    // Apply the fixture.
    const fixtureSql = readFileSync(
      join(__dirname, '..', 'fixtures', 'guidance-freshness-db.sql'),
      'utf-8',
    );
    raw.exec(fixtureSql);

    db = createSqliteAdapter(raw);
  });

  afterAll(async () => {
    await db.close();
  });

  it('reports total guidance document count', async () => {
    const result = await checkDataFreshness(db);
    expect(result.guidance.total).toBe(5);
  });

  it('breaks down by status', async () => {
    const result = await checkDataFreshness(db);
    expect(result.guidance.by_status).toEqual({
      planned: 1,
      draft: 1,
      published: 1,
      current: 1,
      superseded: 1,
    });
  });

  it('breaks down by issuing body', async () => {
    const result = await checkDataFreshness(db);
    expect(result.guidance.by_issuing_body['AI Office']).toBe(4);
    expect(result.guidance.by_issuing_body['MDCG']).toBe(1);
  });

  it('returns pending_publications for planned and draft status only', async () => {
    const result = await checkDataFreshness(db);
    const ids = result.guidance.pending_publications.map((p) => p.id);
    expect(ids).toContain('F_PLANNED');
    expect(ids).toContain('F_DRAFT');
    expect(ids).not.toContain('F_PUBLISHED');
    expect(ids).not.toContain('F_SUPERSEDED');
  });

  it('includes freshness_note from metadata in pending_publications', async () => {
    const result = await checkDataFreshness(db);
    const draft = result.guidance.pending_publications.find((p) => p.id === 'F_DRAFT');
    expect(draft?.note).toContain('second draft published 2026-03-05');
  });

  it('populates dataset_built from db_metadata', async () => {
    const result = await checkDataFreshness(db);
    // Fixture DB has no db_metadata table, so dataset_built should be null
    expect(result.dataset_built).toBeNull();
  });

  it('populates source_registry entries with correct columns', async () => {
    // Create a DB with source_registry data
    const raw = new Database(':memory:');
    const guidanceSchema = readFileSync(
      join(__dirname, '..', '..', 'scripts', 'add-guidance-tables.sql'),
      'utf-8',
    );
    raw.exec(guidanceSchema);
    raw.exec(`
      CREATE TABLE IF NOT EXISTS source_registry (
        regulation TEXT PRIMARY KEY,
        celex_id TEXT,
        eur_lex_version TEXT,
        last_fetched TEXT,
        articles_expected INTEGER,
        articles_parsed INTEGER,
        quality_status TEXT,
        notes TEXT
      );
      CREATE TABLE IF NOT EXISTS db_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO source_registry (regulation, celex_id, last_fetched, quality_status, articles_expected, articles_parsed)
        VALUES ('GDPR', '32016R0679', '2026-04-10T06:00:00Z', 'complete', 99, 99);
      INSERT INTO db_metadata (key, value) VALUES ('built_at', '2026-04-10T19:48:17.483Z');
    `);
    const srcDb = createSqliteAdapter(raw);
    const result = await checkDataFreshness(srcDb);
    expect(result.last_checked).toBe('2026-04-10T06:00:00Z');
    expect(result.source_registry_entries).toBe(1);
    expect(result.sources[0].regulation).toBe('GDPR');
    expect(result.sources[0].celex_id).toBe('32016R0679');
    expect(result.sources[0].quality_status).toBe('complete');
    expect(result.dataset_built).toBe('2026-04-10T19:48:17.483Z');
    await srcDb.close();
  });

  it('returns an empty guidance block fail-soft when guidance tables missing', async () => {
    const raw = new Database(':memory:');
    raw.exec(`
      CREATE TABLE IF NOT EXISTS source_registry (
        regulation TEXT PRIMARY KEY,
        celex_id TEXT,
        last_fetched TEXT,
        quality_status TEXT,
        articles_expected INTEGER,
        articles_parsed INTEGER
      );
    `);
    const emptyDb = createSqliteAdapter(raw);
    const result = await checkDataFreshness(emptyDb);
    expect(result.guidance).toEqual({
      total: 0,
      by_status: {},
      by_issuing_body: {},
      pending_publications: [],
    });
  });
});
