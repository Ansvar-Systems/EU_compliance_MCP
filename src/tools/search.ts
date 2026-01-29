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
 * Build PostgreSQL full-text search query from user input.
 * Uses adaptive logic:
 * - Short queries (1-3 words): AND logic with exact matching for precision
 * - Long queries (4+ words): OR logic with prefix matching for recall
 * This prevents empty results on complex queries while maintaining precision on simple ones.
 */
function buildPostgresQuery(query: string): string {
  // Common stopwords that add noise to searches
  const stopwords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

  // Normalize query: remove quotes, convert hyphens to spaces
  const words = query
    .replace(/['"]/g, '') // Remove quotes
    .replace(/-/g, ' ') // Convert hyphens to spaces (fixes "third-party" → "third party")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word.toLowerCase())); // Filter short words and stopwords

  if (words.length === 0) {
    return '';
  }

  if (words.length <= 3) {
    // Short queries: Use AND logic with exact matching for precision
    return words.join(' & ');
  } else {
    // Long queries: Use OR logic with prefix matching for better recall
    return words.map(word => `${word}:*`).join(' | ');
  }
}

export async function searchRegulations(
  db: DatabaseAdapter,
  input: SearchInput
): Promise<SearchResult[]> {
  let { query, regulations, limit = 10 } = input;

  // Validate and sanitize limit parameter
  if (!Number.isFinite(limit) || limit < 0) {
    limit = 10; // Default to safe value
  }
  // Cap at reasonable maximum
  limit = Math.min(Math.floor(limit), 1000);

  if (!query || query.trim().length === 0) {
    return [];
  }

  const postgresQuery = buildPostgresQuery(query);

  if (!postgresQuery) {
    return [];
  }

  const params: (string | number)[] = [postgresQuery];

  // Build optional regulation filter
  let regulationFilter = '';
  if (regulations && regulations.length > 0) {
    const placeholders = regulations.map((_, i) => `$${i + 2}`).join(', ');
    regulationFilter = ` AND a.regulation IN (${placeholders})`;
    params.push(...regulations);
  }

  // Search in articles using PostgreSQL full-text search
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

  // Search in recitals using PostgreSQL full-text search
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

  try {
    // Execute both queries
    const articlesParams = [...params, limit];
    const recitalsParams = [...params, limit];

    const articleResult = await db.query(articlesQuery, articlesParams);
    const recitalResult = await db.query(recitalsQuery, recitalsParams);

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

    // Combine and sort by relevance, prioritizing articles
    const combined = [...articleRows, ...recitalRows]
      .map(row => ({
        ...row,
        relevance: Math.abs(row.relevance),
      }))
      .sort((a, b) => {
        // First sort by relevance
        if (Math.abs(a.relevance - b.relevance) > 0.01) {
          return b.relevance - a.relevance;
        }
        // If relevance is similar, prioritize articles over recitals
        if (a.type === 'article' && b.type === 'recital') return -1;
        if (a.type === 'recital' && b.type === 'article') return 1;
        return 0;
      })
      .slice(0, limit);

    return combined;
  } catch (error) {
    // If query fails (e.g., syntax error), return empty results
    if (error instanceof Error && error.message.includes('tsquery')) {
      return [];
    }
    throw error;
  }
}
