import type { Database } from 'better-sqlite3';

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
}

export async function getArticle(
  db: Database,
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
    WHERE regulation = ? AND article_number = ?
  `;

  const row = db.prepare(sql).get(regulation, article) as {
    regulation: string;
    article_number: string;
    title: string | null;
    text: string;
    chapter: string | null;
    recitals: string | null;
    cross_references: string | null;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    regulation: row.regulation,
    article_number: row.article_number,
    title: row.title,
    text: row.text,
    chapter: row.chapter,
    recitals: row.recitals ? JSON.parse(row.recitals) : null,
    cross_references: row.cross_references ? JSON.parse(row.cross_references) : null,
  };
}
