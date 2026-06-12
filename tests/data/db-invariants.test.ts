// Data invariants for the committed chassis-shape regulations.db — the same
// file the Dockerfile bakes into the image. These pin the guarantees the
// 2026-06-10 data refresh introduced (issues #70/#71) so a future rebuild
// can't silently regress them:
//   - provision_versions populated (the chassis version tools serve from it)
//   - every recital carries an anchored source_url
//   - the {REG}:meta title-boost rows exist (mcp-base v0.1.36 feature, dormant
//     until this rebuild because the committed DB predated the build-db change)
//   - meta rows get no version history (they are search aids, not legal text)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '..', 'data', 'regulations.db');

let db: Database.Database;
beforeAll(() => {
  db = new Database(DB_PATH, { readonly: true });
});
afterAll(() => db.close());

function one(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

describe('regulations.db invariants', () => {
  it('provision_versions is populated with baseline rows (issue #70)', () => {
    expect(one('SELECT COUNT(*) AS n FROM provision_versions')).toBeGreaterThan(4000);
    expect(
      one('SELECT COUNT(*) AS n FROM provision_versions WHERE effective_date IS NULL'),
    ).toBe(0);
  });

  it('every non-meta provision has exactly one version row, meta rows have none', () => {
    const missing = one(
      `SELECT COUNT(*) AS n FROM provisions p
       WHERE p.canonical_ref NOT LIKE '%:meta'
         AND NOT EXISTS (SELECT 1 FROM provision_versions v WHERE v.canonical_ref = p.canonical_ref)`,
    );
    expect(missing).toBe(0);
    const metaVersions = one(
      `SELECT COUNT(*) AS n FROM provision_versions WHERE canonical_ref LIKE '%:meta'`,
    );
    expect(metaVersions).toBe(0);
  });

  it('every recital has a source_url (issue #71)', () => {
    expect(one('SELECT COUNT(*) AS n FROM recitals WHERE source_url IS NULL')).toBe(0);
  });

  it('recitals of ELI-mappable regulations carry the #rct anchor; consolidated/proposal schemes fall back to the document URL', () => {
    // Plain-OJ CELEX (3YYYY{R|L|D}NNNN) maps to an ELI URL with #rct anchors.
    // Consolidated ('02...') and proposal ('52...PC...') schemes have no ELI
    // anchor — and for consolidated texts, anchoring to the ORIGINAL OJ would
    // cite a different text than the corpus serves. Those keep the
    // document-level URL — that is the honest citation, not a gap.
    const unanchoredEli = one(
      `SELECT COUNT(*) AS n FROM recitals r
       JOIN source_registry sr ON sr.regulation = r.regulation
       WHERE sr.celex_id LIKE '3%' AND r.source_url NOT LIKE '%#rct_%'`,
    );
    expect(unanchoredEli).toBe(0);
    const danglingNonEli = one(
      `SELECT COUNT(*) AS n FROM recitals r
       JOIN source_registry sr ON sr.regulation = r.regulation
       WHERE sr.celex_id NOT LIKE '3%' AND r.source_url NOT LIKE 'http%'`,
    );
    expect(danglingNonEli).toBe(0);
  });

  it('every regulation has a {id}:meta title-boost row (mcp-base v0.1.36 title ranking)', () => {
    const regs = one(
      `SELECT COUNT(DISTINCT substr(canonical_ref, 1, instr(canonical_ref, ':') - 1)) AS n
       FROM provisions`,
    );
    const metas = one(`SELECT COUNT(*) AS n FROM provisions WHERE canonical_ref LIKE '%:meta'`);
    expect(metas).toBe(regs);
  });

  it('recitals_fts inverted index actually matches (external-content FTS5 looks populated even when the index is empty)', () => {
    // search_recitals was silently dead on prod from the 5.A migration until
    // 2026-06-10 because build-db created the external-content FTS table but
    // never built the index. COUNT(*) cannot catch this — only MATCH can.
    expect(
      one(`SELECT COUNT(*) AS n FROM recitals_fts WHERE recitals_fts MATCH 'personal data'`),
    ).toBeGreaterThan(50);
  });

  it('every content row carries source_full_name (CitationBuilder enrichment, 2026-06-10)', () => {
    // The chassis emits _citation.source_full_name / .effective_date from
    // these convention columns — the two fields the gateway cannot derive
    // from a canonical_ref. effective_date is honestly NULL for proposals
    // and L2 acts not yet in application, so only the name is floor-checked.
    expect(
      one('SELECT COUNT(*) AS n FROM content WHERE source_full_name IS NULL'),
    ).toBe(0);
    expect(
      one('SELECT COUNT(*) AS n FROM content WHERE effective_date IS NOT NULL'),
    ).toBeGreaterThan(4000);
  });

  it('the Charter of Fundamental Rights corpus is present (was seed-only before the 2026-06-10 rebuild)', () => {
    expect(
      one(`SELECT COUNT(*) AS n FROM provisions WHERE canonical_ref LIKE 'CFR:art_%'`),
    ).toBeGreaterThan(50);
  });
});

describe('guidance corpus invariants', () => {
  // The per-document license+url convention is enforced table-wide over the
  // whole guidance corpus. The legacy MDCG and AI_ACT documents that predated
  // the convention were backfilled with metadata.license = EU-Decision-2011-833
  // (Commission Decision 2011/833/EU; both families are Commission-published)
  // by the issue #79 backfill — closed by this PR — so this invariant no longer
  // needs the wave-1 (CRA/NIS2/DORA) scoping it carried while those ~100 docs
  // lacked a license.
  it('every guidance document has a license and a URL', () => {
    const rows = db
      .prepare(
        `SELECT id, url, json_extract(metadata, '$.license') AS license
         FROM guidance_documents d`,
      )
      .all() as Array<{ id: string; url: string | null; license: string | null }>;
    const bad = rows.filter((r) => !r.license || !r.url);
    expect(bad.map((r) => r.id)).toEqual([]);
  });

  it('every published guidance document has at least one non-empty section', () => {
    const bad = db
      .prepare(
        `SELECT d.id FROM guidance_documents d
         WHERE d.status = 'published'
           AND NOT EXISTS (
             SELECT 1 FROM guidance_sections s
             WHERE s.document_id = d.id AND length(trim(s.content)) > 0
           )`,
      )
      .all() as Array<{ id: string }>;
    expect(bad.map((r) => r.id)).toEqual([]);
  });

  it('guidance FTS index row count matches guidance_sections', () => {
    const a = (db.prepare('SELECT COUNT(*) AS n FROM guidance_sections').get() as { n: number }).n;
    const b = (
      db.prepare('SELECT COUNT(*) AS n FROM guidance_sections_fts').get() as { n: number }
    ).n;
    expect(b).toBe(a);
  });

  it('every related_regulation resolves to an ingested regulation', () => {
    // 'both' is the historical MDCG value meaning MDR+IVDR. Regulation ids
    // live in source_registry.regulation (there is no `regulations` table in
    // the chassis schema).
    const bad = db
      .prepare(
        `SELECT DISTINCT d.related_regulation AS r FROM guidance_documents d
         WHERE d.related_regulation IS NOT NULL
           AND d.related_regulation != 'both'
           AND d.related_regulation NOT IN (SELECT regulation FROM source_registry)`,
      )
      .all() as Array<{ r: string }>;
    expect(bad.map((x) => x.r)).toEqual([]);
  });
});
