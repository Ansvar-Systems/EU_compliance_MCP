import type { DatabaseAdapter } from '../database/types.js';

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
  db: DatabaseAdapter,
  input: GetRecitalInput
): Promise<Recital | null> {
  const { regulation, recital_number } = input;

  // Validate recital_number is a safe integer
  if (!Number.isInteger(recital_number) || !Number.isFinite(recital_number)) {
    return null;
  }

  // Reject negative or unrealistic recital numbers
  if (recital_number < 1 || recital_number > 10000) {
    return null;
  }

  const sql = `
    SELECT
      regulation,
      recital_number,
      text,
      related_articles
    FROM recitals
    WHERE regulation = $1 AND recital_number = $2
  `;

  const result = await db.query(sql, [regulation, recital_number]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as {
    regulation: string;
    recital_number: number;
    text: string;
    related_articles: string | null;
  };

  return {
    regulation: row.regulation,
    recital_number: row.recital_number,
    text: row.text,
    related_articles: row.related_articles ? JSON.parse(row.related_articles) : null,
  };
}
