import type { Database } from 'better-sqlite3';

export interface GetRecitalInput {
  regulation: string;
  recital_number: number;
}

export interface Recital {
  regulation: string;
  recital_number: number;
  text: string;
  related_articles: string[] | null;
}

export async function getRecital(
  db: Database,
  input: GetRecitalInput
): Promise<Recital | null> {
  const { regulation, recital_number } = input;

  const sql = `
    SELECT
      regulation,
      recital_number,
      text,
      related_articles
    FROM recitals
    WHERE regulation = ? AND recital_number = ?
  `;

  const row = db.prepare(sql).get(regulation, recital_number) as {
    regulation: string;
    recital_number: number;
    text: string;
    related_articles: string | null;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    regulation: row.regulation,
    recital_number: row.recital_number,
    text: row.text,
    related_articles: row.related_articles ? JSON.parse(row.related_articles) : null,
  };
}
