/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEARCH TOOL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Full-text search across all content using SQLite FTS5.
 *
 * This is typically the most important tool in an MCP server - it's how
 * users discover content. Make sure it works well!
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FEATURES
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   - BM25 relevance ranking (same algorithm as Elasticsearch)
 *   - Snippet extraction with context markers
 *   - Source filtering
 *   - Configurable result limit
 *   - Special character escaping for safe queries
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FTS5 QUERY SYNTAX
 * ───────────────────────────────────────────────────────────────────────────
 *
 * FTS5 supports these query operators:
 *
 *   - AND: "data AND protection" (both terms required)
 *   - OR:  "data OR security" (either term)
 *   - NOT: "data NOT personal" (exclude term)
 *   - Phrases: '"personal data"' (exact phrase)
 *   - Prefix: "cyber*" (matches cybersecurity, cyberattack, etc.)
 *   - NEAR: 'data NEAR/5 protection' (within 5 tokens)
 *
 * Special characters that need escaping: " ( ) * : ^
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CUSTOMIZATION
 * ───────────────────────────────────────────────────────────────────────────
 *
 * To adapt this for your server:
 *
 *   1. Update the FTS table name (items_fts)
 *   2. Update the column names to match your schema
 *   3. Adjust snippet parameters for your content type
 *   4. Update the SearchResult interface
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @module tools/search
 * @author Ansvar Systems AB
 * @license Apache-2.0
 *
 * @example Basic search
 * ```typescript
 * const results = await searchContent(db, { query: 'data protection' });
 * ```
 *
 * @example Filtered search
 * ```typescript
 * const results = await searchContent(db, {
 *   query: 'breach notification',
 *   sources: ['GDPR', 'NIS2'],
 *   limit: 5
 * });
 * ```
 *
 * @example MCP tool call
 * ```json
 * {
 *   "name": "search_content",
 *   "arguments": {
 *     "query": "data protection",
 *     "sources": ["GDPR"],
 *     "limit": 10
 *   }
 * }
 * ```
 */

import type { Database } from 'better-sqlite3';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search tool input parameters
 *
 * @property query - Search query string (required)
 * @property sources - Filter to specific sources (optional)
 * @property limit - Maximum results to return (optional, default: 10)
 */
export interface SearchInput {
  /** Search query (supports FTS5 syntax) */
  query: string;

  /**
   * Filter to specific sources
   *
   * When provided, only results from these sources are returned.
   * Source IDs should match the 'id' column in your sources table.
   *
   * @example ['GDPR', 'NIS2']
   */
  sources?: string[];

  /**
   * Maximum number of results
   *
   * @default 10
   * @minimum 1
   * @maximum 50
   */
  limit?: number;
}

/**
 * Search result item
 *
 * Each result includes:
 *   - Source and item identification
 *   - Title (if available)
 *   - Snippet with highlighted matches
 *   - Relevance score for ranking
 */
export interface SearchResult {
  /** Source identifier (e.g., "GDPR") */
  source: string;

  /** Item identifier within source (e.g., "25") */
  item_id: string;

  /** Item title (may be null for items without titles) */
  title: string | null;

  /**
   * Text snippet with match highlighting
   *
   * Matches are wrapped in >>> and <<< markers.
   * Snippet is truncated to ~32 words around matches.
   *
   * @example "...the >>>data protection<<< officer shall..."
   */
  snippet: string;

  /**
   * BM25 relevance score
   *
   * Lower (more negative) is better.
   * Use for sorting results by relevance.
   */
  relevance: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Default number of results to return */
const DEFAULT_LIMIT = 10;

/** Maximum allowed results (prevents resource exhaustion) */
const MAX_LIMIT = 50;

/**
 * Snippet configuration
 *
 * These values control how snippets are extracted:
 *   - Column index (3 = text column in FTS table)
 *   - Start marker for matches
 *   - End marker for matches
 *   - Ellipsis for truncation
 *   - Max tokens in snippet
 */
const SNIPPET_COLUMN = 3;        // Which column to extract snippet from
const SNIPPET_START = '>>>';     // Marker before match
const SNIPPET_END = '<<<';       // Marker after match
const SNIPPET_ELLIPSIS = '...';  // Truncation indicator
const SNIPPET_TOKENS = 32;       // Max tokens in snippet

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search content using full-text search
 *
 * Searches across all items in the database using SQLite FTS5.
 * Results are ranked by BM25 relevance score.
 *
 * @param db - Database connection
 * @param input - Search parameters
 * @returns Array of search results, sorted by relevance
 *
 * @example
 * ```typescript
 * const db = getDb();
 *
 * // Simple search
 * const results = await searchContent(db, { query: 'data protection' });
 *
 * // Filtered and limited
 * const results = await searchContent(db, {
 *   query: 'breach',
 *   sources: ['GDPR'],
 *   limit: 5
 * });
 *
 * // Boolean query
 * const results = await searchContent(db, {
 *   query: 'data AND protection NOT personal'
 * });
 * ```
 */
export async function searchContent(
  db: Database,
  input: SearchInput
): Promise<SearchResult[]> {
  // ─────────────────────────────────────────────────────────────────────────
  // VALIDATE AND NORMALIZE INPUT
  // ─────────────────────────────────────────────────────────────────────────

  // Handle empty query
  if (!input.query || input.query.trim().length === 0) {
    return [];
  }

  // Normalize limit
  const limit = Math.min(
    Math.max(input.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  // Normalize sources (filter empty strings)
  const sources = input.sources?.filter(s => s.length > 0) ?? [];

  // ─────────────────────────────────────────────────────────────────────────
  // PREPARE QUERY
  // ─────────────────────────────────────────────────────────────────────────
  // Escape special FTS5 characters to prevent syntax errors.
  // This allows users to search for terms containing special characters.
  // ─────────────────────────────────────────────────────────────────────────

  const safeQuery = escapeFTS5Query(input.query);

  // ─────────────────────────────────────────────────────────────────────────
  // BUILD SQL QUERY
  // ─────────────────────────────────────────────────────────────────────────
  // The query:
  //   1. Matches against the FTS5 virtual table
  //   2. Extracts snippets with highlighted matches
  //   3. Calculates BM25 relevance score
  //   4. Optionally filters by source
  //   5. Orders by relevance (lower BM25 = better match)
  //   6. Limits results
  // ─────────────────────────────────────────────────────────────────────────

  let sql = `
    SELECT
      source,
      item_id,
      title,
      snippet(
        items_fts,
        ${SNIPPET_COLUMN},
        '${SNIPPET_START}',
        '${SNIPPET_END}',
        '${SNIPPET_ELLIPSIS}',
        ${SNIPPET_TOKENS}
      ) as snippet,
      bm25(items_fts) as relevance
    FROM items_fts
    WHERE items_fts MATCH ?
  `;

  // Parameter array for prepared statement
  const params: (string | number)[] = [safeQuery];

  // ─────────────────────────────────────────────────────────────────────────
  // ADD SOURCE FILTER (if specified)
  // ─────────────────────────────────────────────────────────────────────────
  // Uses IN clause with parameterized placeholders for safety.
  // ─────────────────────────────────────────────────────────────────────────

  if (sources.length > 0) {
    const placeholders = sources.map(() => '?').join(', ');
    sql += ` AND source IN (${placeholders})`;
    params.push(...sources);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADD ORDERING AND LIMIT
  // ─────────────────────────────────────────────────────────────────────────
  // BM25 returns negative values; lower (more negative) = better match.
  // We order by relevance ascending (best matches first).
  // ─────────────────────────────────────────────────────────────────────────

  sql += ` ORDER BY relevance LIMIT ?`;
  params.push(limit);

  // ─────────────────────────────────────────────────────────────────────────
  // EXECUTE QUERY
  // ─────────────────────────────────────────────────────────────────────────

  const rows = db.prepare(sql).all(...params) as SearchResult[];

  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Escape special FTS5 characters in query
 *
 * FTS5 uses certain characters as operators. If users search for terms
 * containing these characters, we need to escape them to prevent syntax
 * errors.
 *
 * Special characters: " ( ) * : ^
 *
 * Escaping strategy: Wrap each special character in double quotes.
 * For example, "test:value" becomes 'test":"value'.
 *
 * @param query - Raw user query
 * @returns Escaped query safe for FTS5
 *
 * @example
 * ```typescript
 * escapeFTS5Query('Article 25(1)');  // 'Article 25"("1")"'
 * escapeFTS5Query('test:value');     // 'test":"value'
 * escapeFTS5Query('"exact phrase"'); // Works as-is (intentional quotes)
 * ```
 */
function escapeFTS5Query(query: string): string {
  // Characters that have special meaning in FTS5
  // Note: We don't escape quotes that are part of phrase searches
  const specialChars = /[()^*:]/g;

  return query.replace(specialChars, (char) => `"${char}"`);
}

/**
 * Highlight matches in text (alternative to FTS5 snippet)
 *
 * Use this if you need more control over highlighting than FTS5 provides.
 * Not used by default, but included as a utility.
 *
 * @param text - Full text to highlight
 * @param query - Search query (simple terms, no FTS5 syntax)
 * @param startMark - Marker to insert before matches
 * @param endMark - Marker to insert after matches
 * @returns Text with highlighted matches
 *
 * @example
 * ```typescript
 * highlightMatches('The data protection officer', 'data protection', '**', '**');
 * // Returns: 'The **data** **protection** officer'
 * ```
 */
export function highlightMatches(
  text: string,
  query: string,
  startMark: string = '>>>',
  endMark: string = '<<<'
): string {
  // Extract individual terms from query (ignore operators)
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(term => !['and', 'or', 'not', 'near'].includes(term))
    .filter(term => term.length > 0);

  if (terms.length === 0) {
    return text;
  }

  // Build regex that matches any term (case-insensitive)
  const pattern = new RegExp(
    `\\b(${terms.map(escapeRegex).join('|')})\\b`,
    'gi'
  );

  return text.replace(pattern, `${startMark}$1${endMark}`);
}

/**
 * Escape special regex characters
 *
 * @param str - String to escape
 * @returns Escaped string safe for regex
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
