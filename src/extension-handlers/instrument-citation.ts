// DB-aware `_citation` resolver for the EU extension tools.
//
// The curated analysis tables (applicability_rules, evidence_requirements,
// control_mappings) and the guide JSONs reference regulations + article
// numbers, not corpus rows. This module resolves such a reference to a real
// provision row in the shipped corpus and builds the canonical `_citation`
// through ./citation.ts (the mcp-base-mirroring builder compare_requirements
// introduced), so every extension-tool row cites the SAME EUR-Lex source data
// the reference-grade `search`/`get_provision` tools serve.
//
// Resolution ladder (exact-id only — no fuzzy matching, per the fleet's
// exact-id discipline):
//   1. article-level  — `${regulation}:art_${article}` (ELI + #art_N anchor)
//   2. instrument-level — `${regulation}:meta` (the instrument's ELI)
//   3. unresolvable   — the CALLER skips-and-counts the row (no fabrication,
//      conformance I5); a URL is never constructed outside the content table.
//
// Sub-paragraph references ("7.2") and inserted articles ("6a") that have no
// `art_X` provision row deliberately resolve at instrument level rather than
// being truncated to a sibling article — truncating "6a" to "6" would cite a
// DIFFERENT article.

import type { SqliteDatabase, SqliteStatement } from './types.js';
import {
  buildProvisionCitation,
  type CitationEnvelope,
  type CitationManifest,
} from './citation.js';

export interface ResolvedCitation {
  citation: CitationEnvelope;
  /** Which rung of the resolution ladder produced the citation. */
  granularity: 'article' | 'instrument';
}

interface CitationSourceRow {
  canonical_ref: string;
  title: string | null;
  source_url: string | null;
  license_code: string | null;
  source_full_name: string | null;
  effective_date: string | null;
}

export interface CitationResolver {
  /**
   * Resolve a `regulation` (+ optional bare article number, e.g. "33") to a
   * cited corpus provision. Returns null when neither the article nor the
   * instrument exists in the corpus, or when the citation triple would be
   * incomplete — callers must skip the row and surface the omission in
   * `meta.message` (mirrors compare_requirements' no-fabrication path).
   */
  resolve(regulation: string, article?: string | null): ResolvedCitation | null;
}

export function createCitationResolver(
  db: SqliteDatabase,
  manifest: CitationManifest,
): CitationResolver {
  const stmt: SqliteStatement = db.prepare(`
    SELECT
      provisions.canonical_ref AS canonical_ref,
      provisions.title AS title,
      content.source_url AS source_url,
      content.license_code AS license_code,
      content.source_full_name AS source_full_name,
      content.effective_date AS effective_date
    FROM provisions
    JOIN content ON content.id = provisions.id
    WHERE provisions.canonical_ref = ?
  `);

  function build(row: CitationSourceRow, displayText: string): CitationEnvelope | null {
    const cite = buildProvisionCitation(
      {
        canonical_ref: row.canonical_ref,
        display_text: displayText,
        source_url: row.source_url,
        license_code: row.license_code,
        source_full_name: row.source_full_name,
        effective_date: row.effective_date,
        // `article` is intentionally NOT passed — matches the reference-grade
        // search/get_provision _citation field-set for eu-regulations (see
        // compare.ts).
      },
      manifest,
    );
    return cite.ok ? cite.citation : null;
  }

  return {
    resolve(regulation: string, article?: string | null): ResolvedCitation | null {
      if (article) {
        const ref = `${regulation}:art_${article}`;
        const row = stmt.get(ref) as CitationSourceRow | undefined;
        if (row) {
          const displayText = row.title
            ? `${regulation} art_${article} — ${row.title}`
            : `${regulation} art_${article}`;
          const citation = build(row, displayText);
          if (citation) return { citation, granularity: 'article' };
        }
      }
      const metaRow = stmt.get(`${regulation}:meta`) as CitationSourceRow | undefined;
      if (metaRow) {
        const citation = build(metaRow, metaRow.source_full_name ?? regulation);
        if (citation) return { citation, granularity: 'instrument' };
      }
      return null;
    },
  };
}
