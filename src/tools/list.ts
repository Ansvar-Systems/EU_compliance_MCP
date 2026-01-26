import type { Database } from 'better-sqlite3';

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
  db: Database,
  input: ListInput
): Promise<ListResult> {
  const { regulation } = input;

  if (regulation) {
    // Get specific regulation with chapters
    const regRow = db.prepare(`
      SELECT id, full_name, celex_id, effective_date
      FROM regulations
      WHERE id = ?
    `).get(regulation) as {
      id: string;
      full_name: string;
      celex_id: string;
      effective_date: string | null;
    } | undefined;

    if (!regRow) {
      return { regulations: [] };
    }

    // Get articles grouped by chapter
    const articles = db.prepare(`
      SELECT article_number, title, chapter
      FROM articles
      WHERE regulation = ?
      ORDER BY CAST(article_number AS INTEGER)
    `).all(regulation) as Array<{
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
  const rows = db.prepare(`
    SELECT
      r.id,
      r.full_name,
      r.celex_id,
      r.effective_date,
      COUNT(a.rowid) as article_count
    FROM regulations r
    LEFT JOIN articles a ON a.regulation = r.id
    GROUP BY r.id
    ORDER BY r.id
  `).all() as Array<{
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
      article_count: row.article_count,
    })),
  };
}
