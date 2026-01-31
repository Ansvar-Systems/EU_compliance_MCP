import type { DatabaseAdapter } from '../database/types.js';

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
  type?: 'article' | 'recital';
}

/**
 * Escape special FTS5 query characters and build optimal search query for SQLite.
 */
function escapeFts5Query(query: string): string {
  const stopwords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

  const words = query
    .replace(/['"]/g, '')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word.toLowerCase()));

  if (words.length === 0) {
    return '';
  }

  if (words.length <= 3) {
    return words.join(' ');  // Space is AND in FTS5
  } else {
    return words.map(word => `${word}*`).join(' OR ');  // Suffix * for prefix matching
  }
}

/**
 * Build PostgreSQL full-text search query from user input.
 */
function buildPostgresQuery(query: string): string {
  const stopwords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

  const words = query
    .replace(/['"]/g, '')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word.toLowerCase()));

  if (words.length === 0) {
    return '';
  }

  if (words.length <= 3) {
    return words.join(' & ');
  } else {
    return words.map(word => `${word}:*`).join(' | ');
  }
}

async function searchSqlite(
  db: DatabaseAdapter,
  query: string,
  regulations: string[] | undefined,
  limit: number
): Promise<SearchResult[]> {
  const escapedQuery = escapeFts5Query(query);
  if (!escapedQuery) {
    return [];
  }

  const params: (string | number)[] = [escapedQuery];

  let regulationFilter = '';
  if (regulations && regulations.length > 0) {
    const placeholders = regulations.map(() => '?').join(', ');
    regulationFilter = ` AND regulation IN (${placeholders})`;
    params.push(...regulations);
  }

  const articlesQuery = `
    SELECT
      articles_fts.regulation,
      articles_fts.article_number as article,
      articles_fts.title,
      snippet(articles_fts, 3, '>>>', '<<<', '...', 32) as snippet,
      bm25(articles_fts) as relevance,
      'article' as type
    FROM articles_fts
    WHERE articles_fts MATCH ?
    ${regulationFilter}
    ORDER BY bm25(articles_fts)
    LIMIT ?
  `;

  const recitalsQuery = `
    SELECT
      recitals_fts.regulation,
      CAST(recitals_fts.recital_number AS TEXT) as article,
      'Recital ' || recitals_fts.recital_number as title,
      snippet(recitals_fts, 2, '>>>', '<<<', '...', 32) as snippet,
      bm25(recitals_fts) as relevance,
      'recital' as type
    FROM recitals_fts
    WHERE recitals_fts MATCH ?
    ${regulationFilter}
    ORDER BY bm25(recitals_fts)
    LIMIT ?
  `;

  const articlesParams = [...params, limit];
  const recitalsParams = [...params, limit];

  let articleResult, recitalResult;
  try {
    articleResult = await db.query(articlesQuery, articlesParams);
    recitalResult = await db.query(recitalsQuery, recitalsParams);
  } catch (error) {
    // FTS5 syntax errors from malformed queries - return empty results
    if (error instanceof Error && (error.message.includes('fts5: syntax error') || error.message.includes('SQLITE_ERROR'))) {
      return [];
    }
    throw error;
  }

  const articleRows = articleResult.rows as Array<{
    regulation: string;
    article: string;
    title: string;
    snippet: string;
    relevance: number;
    type: 'article' | 'recital';
  }>;

  const recitalRows = recitalResult.rows as Array<{
    regulation: string;
    article: string;
    title: string;
    snippet: string;
    relevance: number;
    type: 'article' | 'recital';
  }>;

  const combined = [...articleRows, ...recitalRows]
    .map(row => ({
      ...row,
      relevance: Math.abs(row.relevance),
    }))
    .sort((a, b) => {
      if (Math.abs(a.relevance - b.relevance) > 0.01) {
        return b.relevance - a.relevance;
      }
      if (a.type === 'article' && b.type === 'recital') return -1;
      if (a.type === 'recital' && b.type === 'article') return 1;
      return 0;
    })
    .slice(0, limit);

  return combined;
}

async function searchPostgres(
  db: DatabaseAdapter,
  query: string,
  regulations: string[] | undefined,
  limit: number
): Promise<SearchResult[]> {
  const postgresQuery = buildPostgresQuery(query);
  if (!postgresQuery) {
    return [];
  }

  const params: (string | number)[] = [postgresQuery];

  let regulationFilter = '';
  if (regulations && regulations.length > 0) {
    const placeholders = regulations.map((_, i) => `$${i + 2}`).join(', ');
    regulationFilter = ` AND a.regulation IN (${placeholders})`;
    params.push(...regulations);
  }

  const articlesQuery = `
    SELECT
      a.regulation,
      a.article_number as article,
      a.title,
      ts_headline('english', a.text, plainto_tsquery('english', $1),
        'StartSel=>>>, StopSel=<<<, MaxWords=32, MinWords=16') as snippet,
      ts_rank(to_tsvector('english', COALESCE(a.title, '') || ' ' || a.text),
              plainto_tsquery('english', $1)) as relevance,
      'article' as type
    FROM articles a
    WHERE to_tsvector('english', COALESCE(a.title, '') || ' ' || a.text) @@ plainto_tsquery('english', $1)
    ${regulationFilter}
    ORDER BY relevance DESC
    LIMIT $${params.length + 1}
  `;

  const recitalsQuery = `
    SELECT
      r.regulation,
      r.recital_number::TEXT as article,
      'Recital ' || r.recital_number as title,
      ts_headline('english', r.text, plainto_tsquery('english', $1),
        'StartSel=>>>, StopSel=<<<, MaxWords=32, MinWords=16') as snippet,
      ts_rank(to_tsvector('english', r.text), plainto_tsquery('english', $1)) as relevance,
      'recital' as type
    FROM recitals r
    WHERE to_tsvector('english', r.text) @@ plainto_tsquery('english', $1)
    ${regulationFilter.replace(/a\.regulation/g, 'r.regulation')}
    ORDER BY relevance DESC
    LIMIT $${params.length + 1}
  `;

  const articlesParams = [...params, limit];
  const recitalsParams = [...params, limit];

  let articleResult, recitalResult;
  try {
    articleResult = await db.query(articlesQuery, articlesParams);
    recitalResult = await db.query(recitalsQuery, recitalsParams);
  } catch (error) {
    // FTS5 syntax errors from malformed queries - return empty results
    if (error instanceof Error && (error.message.includes('fts5: syntax error') || error.message.includes('SQLITE_ERROR'))) {
      return [];
    }
    throw error;
  }

  const articleRows = articleResult.rows as Array<{
    regulation: string;
    article: string;
    title: string;
    snippet: string;
    relevance: number;
    type: 'article' | 'recital';
  }>;

  const recitalRows = recitalResult.rows as Array<{
    regulation: string;
    article: string;
    title: string;
    snippet: string;
    relevance: number;
    type: 'article' | 'recital';
  }>;

  const combined = [...articleRows, ...recitalRows]
    .map(row => ({
      ...row,
      relevance: Math.abs(row.relevance),
    }))
    .sort((a, b) => {
      if (Math.abs(a.relevance - b.relevance) > 0.01) {
        return b.relevance - a.relevance;
      }
      if (a.type === 'article' && b.type === 'recital') return -1;
      if (a.type === 'recital' && b.type === 'article') return 1;
      return 0;
    })
    .slice(0, limit);

  return combined;
}

export async function searchRegulations(
  db: DatabaseAdapter,
  input: SearchInput
): Promise<SearchResult[]> {
  let { query, regulations, limit = 10 } = input;

  if (!Number.isFinite(limit) || limit < 0) {
    limit = 10;
  }
  limit = Math.min(Math.floor(limit), 1000);

  if (!query || query.trim().length === 0) {
    return [];
  }

  try {
    if (db.type === 'sqlite') {
      return await searchSqlite(db, query, regulations, limit);
    } else {
      return await searchPostgres(db, query, regulations, limit);
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('tsquery') || error.message.includes('MATCH'))) {
      return [];
    }
    throw error;
  }
}
