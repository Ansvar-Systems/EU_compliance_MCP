import type { DatabaseAdapter } from '../database/types.js';

export interface ListInput {
  regulation?: string;
}

export interface Chapter {
  number: string;
  title: string;
  articles: string[];
}

export interface RegulationInfo {
  id: string;
  full_name: string;
  celex_id: string;
  effective_date: string | null;
  article_count: number;
  chapters?: Chapter[];
}

export interface ListResult {
  regulations: RegulationInfo[];
}

export async function listRegulations(
  db: DatabaseAdapter,
  input: ListInput
): Promise<ListResult> {
  const { regulation } = input;

  if (regulation) {
    // Get specific regulation with chapters
    const regResult = await db.query(
      `SELECT id, full_name, celex_id, effective_date
       FROM regulations
       WHERE id = $1`,
      [regulation]
    );

    if (regResult.rows.length === 0) {
      return { regulations: [] };
    }

    const regRow = regResult.rows[0] as {
      id: string;
      full_name: string;
      celex_id: string;
      effective_date: string | null;
    };

    // Get articles grouped by chapter
    const articlesResult = await db.query(
      `SELECT article_number, title, chapter
       FROM articles
       WHERE regulation = $1
       ORDER BY article_number::INTEGER`,
      [regulation]
    );

    const articles = articlesResult.rows as Array<{
      article_number: string;
      title: string | null;
      chapter: string | null;
    }>;

    // Group by chapter
    const chapterMap = new Map<string, Chapter>();
    for (const article of articles) {
      const chapterKey = article.chapter || 'General';
      if (!chapterMap.has(chapterKey)) {
        chapterMap.set(chapterKey, {
          number: chapterKey,
          title: `Chapter ${chapterKey}`,
          articles: [],
        });
      }
      chapterMap.get(chapterKey)!.articles.push(article.article_number);
    }

    return {
      regulations: [{
        id: regRow.id,
        full_name: regRow.full_name,
        celex_id: regRow.celex_id,
        effective_date: regRow.effective_date,
        article_count: articles.length,
        chapters: Array.from(chapterMap.values()),
      }],
    };
  }

  // List all regulations with article counts
  const result = await db.query(
    `SELECT
      r.id,
      r.full_name,
      r.celex_id,
      r.effective_date,
      COUNT(a.regulation) as article_count
    FROM regulations r
    LEFT JOIN articles a ON a.regulation = r.id
    GROUP BY r.id, r.full_name, r.celex_id, r.effective_date
    ORDER BY r.id`
  );

  const rows = result.rows as Array<{
    id: string;
    full_name: string;
    celex_id: string;
    effective_date: string | null;
    article_count: number;
  }>;

  return {
    regulations: rows.map(row => ({
      id: row.id,
      full_name: row.full_name,
      celex_id: row.celex_id,
      effective_date: row.effective_date,
      article_count: Number(row.article_count),
    })),
  };
}
