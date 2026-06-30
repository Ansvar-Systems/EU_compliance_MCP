import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '..', 'data', 'regulations.db');

// Regression guard for the 2026-06-29 QA finding: empty-content (heading/TOC-only)
// guidance sections were FTS-indexed and surfaced in search_agency_guidance as
// title-only hits with no usable text (e.g. "...risk management process and
// safety: 10"). The guidance_sections_ai trigger now guards on non-empty content
// so those headings stay in guidance_sections (hierarchy intact) but are not
// searchable.
describe('guidance FTS excludes empty-content heading sections', () => {
  let db: Database.Database;
  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
  });
  afterAll(() => db.close());

  it('the guidance_sections_ai trigger guards on non-empty content', () => {
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'guidance_sections_ai'")
      .get() as { sql: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.sql).toMatch(/WHEN\s+length\(trim\(new\.content\)\)\s*>\s*0/);
  });

  it('guidance_sections_fts columns are (title, content) so snippet(...,1,...) = content', () => {
    // mcp-base search_guidance calls snippet(guidance_sections_fts, 1, ...) expecting
    // column index 1 = content. A wider FTS shape (e.g. document_id, section_number,
    // title, content) shifts content out of index 1 and renders hits as
    // "<title>: <section_number>" (2026-06-30 QA: "safety (full text): safety").
    const cols = (
      db.prepare('PRAGMA table_info(guidance_sections_fts)').all() as Array<{ name: string }>
    ).map((r) => r.name);
    expect(cols).toEqual(['title', 'content']);
  });

  it('heading-only sections exist but none is reachable via FTS by its own title', () => {
    const empty = db
      .prepare("SELECT id, title FROM guidance_sections WHERE length(trim(content)) = 0")
      .all() as Array<{ id: number; title: string }>;
    expect(empty.length).toBeGreaterThan(0); // there ARE heading-only sections to guard

    const matchByTitle = db.prepare(
      'SELECT rowid FROM guidance_sections_fts WHERE guidance_sections_fts MATCH ?',
    );
    for (const s of empty) {
      // Quote the title as an FTS phrase; an excluded row never enters the index,
      // so it can only appear here if a DIFFERENT (real-content) row also matches.
      const phrase = '"' + s.title.replace(/"/g, '') + '"';
      const rowids = (matchByTitle.all(phrase) as Array<{ rowid: number }>).map((r) => r.rowid);
      expect(rowids).not.toContain(s.id);
    }
  });
});
