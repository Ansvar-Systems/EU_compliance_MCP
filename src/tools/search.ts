import type { Database } from 'better-sqlite3';

export interface SearchInput {
  query: string;
  regulations?: string[];
  limit?: number;
}

export interface SearchResult {
  regulation: string;
  article: string;
  title: string;
  snippet: string;
  relevance: number;
}

/**
 * Escape special FTS5 query characters to prevent syntax errors.
 * FTS5 uses double quotes for phrase queries and has special operators.
 */
function escapeFts5Query(query: string): string {
  // Remove characters that have special meaning in FTS5
  // and wrap each word in double quotes for exact matching
  return query
    .replace(/['"]/g, '') // Remove quotes
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(word => `"${word}"`)
    .join(' ');
}

export async function searchRegulations(
  db: Database,
  input: SearchInput
): Promise<SearchResult[]> {
  const { query, regulations, limit = 10 } = input;

  if (!query || query.trim().length === 0) {
    return [];
  }

  const escapedQuery = escapeFts5Query(query);

  if (!escapedQuery) {
    return [];
  }

  // Build the SQL query with optional regulation filter
  let sql = `
    SELECT
      articles_fts.regulation,
      articles_fts.article_number as article,
      articles_fts.title,
      snippet(articles_fts, 3, '>>>', '<<<', '...', 32) as snippet,
      bm25(articles_fts) as relevance
    FROM articles_fts
    WHERE articles_fts MATCH ?
  `;

  const params: (string | number)[] = [escapedQuery];

  if (regulations && regulations.length > 0) {
    const placeholders = regulations.map(() => '?').join(', ');
    sql += ` AND articles_fts.regulation IN (${placeholders})`;
    params.push(...regulations);
  }

  // Order by relevance (bm25 returns negative scores, more negative = more relevant)
  sql += ` ORDER BY bm25(articles_fts)`;
  sql += ` LIMIT ?`;
  params.push(limit);

  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as Array<{
      regulation: string;
      article: string;
      title: string;
      snippet: string;
      relevance: number;
    }>;

    // Convert bm25 scores to positive values (higher = more relevant)
    return rows.map(row => ({
      ...row,
      relevance: Math.abs(row.relevance),
    }));
  } catch (error) {
    // If FTS5 query fails (e.g., syntax error), return empty results
    if (error instanceof Error && error.message.includes('fts5')) {
      return [];
    }
    throw error;
  }
}
