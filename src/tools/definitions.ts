import type { DatabaseAdapter } from '../database/types.js';
import { buildCitation } from '../utils/citation.js';

export interface DefinitionsInput {
  term: string;
  regulation?: string;
  limit?: number;
}

export interface Definition {
  term: string;
  regulation: string;
  article: string;
  definition: string;
  related_terms?: string[];
}

export async function getDefinitions(
  db: DatabaseAdapter,
  input: DefinitionsInput
): Promise<Definition[]> {
  const { term, regulation } = input;

  // Schema marks ``term`` as required but the MCP SDK hands arguments to
  // the handler without validating against the schema. Pre-fix, a call
  // omitting ``term`` (the prod ``get_definitions(GDPR)`` report on
  // 2026-04-20) surfaced as "Cannot read properties of undefined
  // (reading 'replace')" from inside the LIKE-wildcard escape.
  //
  // Empty strings are intentionally NOT rejected here — an existing
  // edge-case test (``tests/comprehensive/edge-cases.test.ts``) asserts
  // that empty/odd-shape terms return an array without crashing.
  // Empty-string falls through to a ``%%`` LIKE pattern; the ``limit``
  // cap (500) keeps that bounded.
  if (typeof term !== 'string') {
    throw new Error(
      'term is required: pass a string to search for (e.g. "personal data")',
    );
  }

  let limit = input.limit ?? 50;
  if (!Number.isFinite(limit) || limit < 0) limit = 50;
  limit = Math.min(Math.floor(limit), 500);

  let sql = `
    SELECT
      term,
      regulation,
      article,
      definition
    FROM definitions
    WHERE term ILIKE $1
  `;

  // Escape LIKE wildcards in user input to prevent unintended pattern matching
  const escapedTerm = term.replace(/%/g, '\\%').replace(/_/g, '\\_');
  const params: (string | number)[] = [`%${escapedTerm}%`];

  if (regulation) {
    sql += ` AND regulation = $2`;
    params.push(regulation);
  }

  sql += ` ORDER BY regulation, term`;
  sql += ` LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await db.query(sql, params);

  return result.rows.map((row: any) => ({
    term: row.term,
    regulation: row.regulation,
    article: row.article,
    definition: row.definition,
    _citation: buildCitation(
      `${row.regulation} — ${row.term}`,
      `Definition of "${row.term}" in ${row.regulation} (${row.article})`,
      'get_definitions',
      { term: row.term, ...(regulation ? { regulation } : {}) },
    ),
  }));
}
