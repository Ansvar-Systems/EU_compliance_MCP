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
  type?: 'article' | 'recital';
}

/**
 * Escape special FTS5 query characters and build optimal search query.
 * Uses adaptive logic:
 * - Short queries (1-3 words): AND logic with exact matching for precision
 * - Long queries (4+ words): OR logic with prefix matching for recall
 * This prevents empty results on complex queries while maintaining precision on simple ones.
 *
 * Handles hyphenated terms by converting them to spaces (e.g., "third-party" → "third party")
 * to avoid FTS5 syntax errors where hyphens are interpreted as operators.
 */
function escapeFts5Query(query: string): string {
  // Common stopwords that add noise to searches
  const stopwords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

  // Normalize query: remove quotes, convert hyphens to spaces
  // This allows "third-party" to become "third party" which FTS5 handles naturally
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
    // Example: "incident reporting" → "incident" "reporting"
    return words.map(word => `"${word}"`).join(' ');
  } else {
    // Long queries: Use OR logic with prefix matching for better recall
    // Example: "incident reporting notification timeline" → incident* OR reporting* OR notification* OR timeline*
    // BM25 will still rank documents with more matches higher
    return words.map(word => `${word}*`).join(' OR ');
  }
}

export async function searchRegulations(
  db: Database,
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

  const escapedQuery = escapeFts5Query(query);

  if (!escapedQuery) {
    return [];
  }

  const params: (string | number)[] = [escapedQuery];

  // Build optional regulation filter
  let regulationFilter = '';
  if (regulations && regulations.length > 0) {
    const placeholders = regulations.map(() => '?').join(', ');
    regulationFilter = ` AND regulation IN (${placeholders})`;
    params.push(...regulations);
  }

  // Search in articles
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

  // Search in recitals
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

  try {
    // Execute both queries
    const articlesParams = [...params, limit];
    const recitalsParams = [...params, limit];

    const articleStmt = db.prepare(articlesQuery);
    const recitalStmt = db.prepare(recitalsQuery);

    const articleRows = articleStmt.all(...articlesParams) as Array<{
      regulation: string;
      article: string;
      title: string;
      snippet: string;
      relevance: number;
      type: 'article' | 'recital';
    }>;

    const recitalRows = recitalStmt.all(...recitalsParams) as Array<{
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
    // If FTS5 query fails (e.g., syntax error), return empty results
    if (error instanceof Error && error.message.includes('fts5')) {
      return [];
    }
    throw error;
  }
}
