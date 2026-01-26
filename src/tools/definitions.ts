import type { Database } from 'better-sqlite3';

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
  db: Database,
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
    WHERE term LIKE ?
  `;

  const params: string[] = [`%${term}%`];

  if (regulation) {
    sql += ` AND regulation = ?`;
    params.push(regulation);
  }

  sql += ` ORDER BY regulation, term`;

  const rows = db.prepare(sql).all(...params) as Array<{
    term: string;
    regulation: string;
    article: string;
    definition: string;
  }>;

  return rows.map(row => ({
    term: row.term,
    regulation: row.regulation,
    article: row.article,
    definition: row.definition,
  }));
}
