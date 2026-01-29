import type { DatabaseAdapter } from '../database/types.js';

export interface DefinitionsInput {
  term: string;
  regulation?: string;
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

  let sql = `
    SELECT
      term,
      regulation,
      article,
      definition
    FROM definitions
    WHERE term ILIKE $1
  `;

  const params: string[] = [`%${term}%`];

  if (regulation) {
    sql += ` AND regulation = $2`;
    params.push(regulation);
  }

  sql += ` ORDER BY regulation, term`;

  const result = await db.query(sql, params);

  return result.rows.map((row: any) => ({
    term: row.term,
    regulation: row.regulation,
    article: row.article,
    definition: row.definition,
  }));
}
