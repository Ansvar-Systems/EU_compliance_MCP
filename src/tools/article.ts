import type { DatabaseAdapter } from '../database/types.js';

export interface GetArticleInput {
  regulation: string;
  article: string;
  include_recitals?: boolean;
}

export interface Article {
  regulation: string;
  article_number: string;
  title: string | null;
  text: string;
  chapter: string | null;
  recitals: string[] | null;
  cross_references: string[] | null;
  truncated?: boolean;
  original_length?: number;
  token_estimate?: number;
}

export async function getArticle(
  db: DatabaseAdapter,
  input: GetArticleInput
): Promise<Article | null> {
  const { regulation, article } = input;

  const sql = `
    SELECT
      regulation,
      article_number,
      title,
      text,
      chapter,
      recitals,
      cross_references
    FROM articles
    WHERE regulation = $1 AND article_number = $2
  `;

  const result = await db.query(sql, [regulation, article]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as {
    regulation: string;
    article_number: string;
    title: string | null;
    text: string;
    chapter: string | null;
    recitals: string | null;
    cross_references: string | null;
  };

  // Token management: Truncate very large articles to prevent context overflow
  const MAX_CHARS = 50000; // ~12,500 tokens (safe for 200k context window)
  const originalLength = row.text.length;
  const tokenEstimate = Math.ceil(originalLength / 4); // ~4 chars per token
  let text = row.text;
  let truncated = false;

  if (originalLength > MAX_CHARS) {
    text = row.text.substring(0, MAX_CHARS) + '\n\n[... Article truncated due to length. Original: ' + originalLength + ' chars (~' + tokenEstimate + ' tokens). Use search_regulations to find specific sections.]';
    truncated = true;
  }

  return {
    regulation: row.regulation,
    article_number: row.article_number,
    title: row.title,
    text,
    chapter: row.chapter,
    recitals: row.recitals ? JSON.parse(row.recitals) : null,
    cross_references: row.cross_references ? JSON.parse(row.cross_references) : null,
    truncated,
    original_length: truncated ? originalLength : undefined,
    token_estimate: truncated ? tokenEstimate : undefined,
  };
}
