/**
 * AI Act guidance golden contract tests.
 *
 * Runs against the built data/regulations.db and asserts that the 5 published
 * Commission guidance documents and 3 pending-publication placeholders are
 * addressable via list_guidance, search_guidance, get_guidance_section, and
 * check_data_freshness.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from '@ansvar/mcp-sqlite';
import { copyFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { searchGuidance, listGuidance, getGuidanceSection } from '../../src/tools/guidance.js';
import { checkDataFreshness } from '../../src/tools/freshness.js';
import { createSqliteAdapter } from '../../src/database/sqlite-adapter.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_DB = join(__dirname, '..', '..', 'data', 'regulations.db');

describe('AI Act guidance (golden contract)', () => {
  let db: DatabaseAdapter;
  let tmpDir: string;

  beforeAll(() => {
    // Copy DB to tmp to avoid file-lock contention with drift-detection.
    tmpDir = mkdtempSync(join(tmpdir(), 'ai-act-guidance-golden-'));
    const dbCopy = join(tmpDir, 'regulations.db');
    copyFileSync(SOURCE_DB, dbCopy);
    const sqliteDb = new Database(dbCopy, { readonly: true });
    db = createSqliteAdapter(sqliteDb);
  });

  afterAll(async () => {
    await db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('list_guidance(related_regulation=AI_ACT) returns all 8 documents', async () => {
    const result = await listGuidance(db, { related_regulation: 'AI_ACT' });
    expect(result.length).toBeGreaterThanOrEqual(8);
    const ids = result.map((r) => r.id);
    for (const expected of [
      'AI_ACT_GL_PROHIBITED',
      'AI_ACT_GL_DEFINITION',
      'AI_ACT_COP_GPAI',
      'AI_ACT_GL_GPAI_SCOPE',
      'AI_ACT_TMPL_TRAINING_DATA',
      'AI_ACT_GL_HIGH_RISK',
      'AI_ACT_GL_TRANSPARENCY',
      'AI_ACT_COP_MARKING',
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it('search_guidance finds prohibited practices content', async () => {
    const hits = await searchGuidance(db, {
      query: 'prohibited practices',
      related_regulation: 'AI_ACT',
      limit: 10,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.document_id === 'AI_ACT_GL_PROHIBITED')).toBe(true);
  });

  it('search_guidance finds GPAI transparency content', async () => {
    const hits = await searchGuidance(db, {
      query: 'general-purpose AI transparency',
      related_regulation: 'AI_ACT',
      limit: 10,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.document_id === 'AI_ACT_COP_GPAI')).toBe(true);
  });

  it('get_guidance_section returns a section for GPAI CoP transparency chapter', async () => {
    // GPAI CoP was ingested via full-doc fallback, so sections are named by
    // chapter prefix: transparency, copyright, safety.
    const section = await getGuidanceSection(db, {
      document_id: 'AI_ACT_COP_GPAI',
      section_number: 'transparency',
    });
    expect(section).not.toBeNull();
    expect(section!.content.length).toBeGreaterThan(500);
  });

  it('check_data_freshness surfaces all 3 placeholders in pending_publications', async () => {
    const result = await checkDataFreshness(db);
    const ids = result.guidance.pending_publications.map((p) => p.id);
    expect(ids).toContain('AI_ACT_GL_HIGH_RISK');
    expect(ids).toContain('AI_ACT_GL_TRANSPARENCY');
    expect(ids).toContain('AI_ACT_COP_MARKING');
  });

  it('check_data_freshness.guidance.total includes all 8 AI Act documents', async () => {
    // Note: MDCG docs (~105) are only present if ingest-mdcg-guidance.ts has
    // been run; they're not shipped in the base committed DB. The baseline
    // assertion here is that the 8 AI Act documents are discoverable.
    const result = await checkDataFreshness(db);
    expect(result.guidance.total).toBeGreaterThanOrEqual(8);
  });

  it('placeholder note is surfaced in pending_publications', async () => {
    const result = await checkDataFreshness(db);
    const marking = result.guidance.pending_publications.find(
      (p) => p.id === 'AI_ACT_COP_MARKING',
    );
    expect(marking?.note).toContain('2026-03-05');
  });
});
