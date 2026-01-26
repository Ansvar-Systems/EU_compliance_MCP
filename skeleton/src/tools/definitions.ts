/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEFINITIONS TOOL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Looks up official definitions of terms from your data sources.
 *
 * Legal and regulatory documents often have precise definitions for key
 * terms. This tool helps users find these official definitions rather
 * than relying on general knowledge.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * USE CASES
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   - "What is the definition of 'personal data'?"
 *   - "How does GDPR define 'processing'?"
 *   - "What does 'essential service' mean under NIS2?"
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FEATURES
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   - Partial matching (finds "personal data" when searching "personal")
 *   - Case-insensitive search
 *   - Optional source filtering
 *   - Shows which item defines the term (for citation)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CUSTOMIZATION
 * ───────────────────────────────────────────────────────────────────────────
 *
 * To adapt for your server:
 *
 *   1. Update table/column names in SQL queries
 *   2. Modify Definition interface to match your schema
 *   3. Adjust matching behavior (exact vs. partial)
 *   4. Add relevance ranking if you have many definitions
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @module tools/definitions
 * @author Ansvar Systems AB
 * @license Apache-2.0
 *
 * @example Basic lookup
 * ```typescript
 * const results = await lookupDefinition(db, {
 *   term: 'personal data'
 * });
 * ```
 *
 * @example Source-specific lookup
 * ```typescript
 * const results = await lookupDefinition(db, {
 *   term: 'processing',
 *   source: 'GDPR'
 * });
 * ```
 *
 * @example MCP tool call
 * ```json
 * {
 *   "name": "lookup_definition",
 *   "arguments": {
 *     "term": "personal data",
 *     "source": "GDPR"
 *   }
 * }
 * ```
 */

import type { Database } from 'better-sqlite3';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Definition lookup input parameters
 *
 * @property term - Term to look up (required)
 * @property source - Limit search to specific source (optional)
 */
export interface DefinitionInput {
  /**
   * Term to look up
   *
   * Supports partial matching - searching for "data" will find
   * "personal data", "data subject", etc.
   *
   * Case-insensitive.
   *
   * @example "personal data", "processing", "breach"
   */
  term: string;

  /**
   * Limit search to specific source
   *
   * When omitted, searches across all sources.
   * Different sources may define the same term differently.
   *
   * @example "GDPR", "NIS2"
   */
  source?: string;
}

/**
 * Definition result
 *
 * Contains the term, its definition, and citation information.
 */
export interface Definition {
  /** The defined term (exact as stored) */
  term: string;

  /** Official definition text */
  definition: string;

  /** Source that defines this term */
  source: string;

  /**
   * Item that contains this definition
   *
   * For citation purposes. Format depends on data:
   *   - GDPR: "4" (Article 4)
   *   - NIS2: "6" (Article 6)
   *
   * May be null if definition isn't in a specific article.
   */
  defining_item: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum definitions to return */
const MAX_RESULTS = 20;

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Look up definitions of a term
 *
 * Searches for definitions that match the given term.
 * Uses partial matching so "data" finds "personal data", etc.
 *
 * @param db - Database connection
 * @param input - Search parameters
 * @returns Matching definitions, empty array if none found
 *
 * @example
 * ```typescript
 * const db = getDb();
 *
 * // Search all sources
 * const results = await lookupDefinition(db, {
 *   term: 'personal data'
 * });
 * // Returns definitions from GDPR, NIS2, etc.
 *
 * // Search specific source
 * const gdprDef = await lookupDefinition(db, {
 *   term: 'personal data',
 *   source: 'GDPR'
 * });
 * // Returns only GDPR's definition
 *
 * // Partial matching
 * const dataDefs = await lookupDefinition(db, {
 *   term: 'data'
 * });
 * // Returns: personal data, data subject, data breach, etc.
 * ```
 */
export async function lookupDefinition(
  db: Database,
  input: DefinitionInput
): Promise<Definition[]> {
  // ─────────────────────────────────────────────────────────────────────────
  // VALIDATE INPUT
  // ─────────────────────────────────────────────────────────────────────────

  if (!input.term || input.term.trim().length === 0) {
    return [];
  }

  const searchTerm = input.term.trim();

  // ─────────────────────────────────────────────────────────────────────────
  // BUILD QUERY
  // ─────────────────────────────────────────────────────────────────────────
  // Uses LIKE with wildcards for partial matching.
  // COLLATE NOCASE makes it case-insensitive.
  // ─────────────────────────────────────────────────────────────────────────

  let sql = `
    SELECT
      term,
      definition,
      source,
      defining_item
    FROM definitions
    WHERE term LIKE ? COLLATE NOCASE
  `;

  // Use wildcards for partial matching
  const params: string[] = [`%${searchTerm}%`];

  // ─────────────────────────────────────────────────────────────────────────
  // ADD SOURCE FILTER (if specified)
  // ─────────────────────────────────────────────────────────────────────────

  if (input.source) {
    sql += ` AND source = ?`;
    params.push(input.source);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ORDER AND LIMIT
  // ─────────────────────────────────────────────────────────────────────────
  // Order by:
  //   1. Exact matches first (term = search term)
  //   2. Starts-with matches second (term LIKE 'search%')
  //   3. Then alphabetically by term
  //
  // This ensures "personal data" appears before "non-personal data"
  // when searching for "personal data".
  // ─────────────────────────────────────────────────────────────────────────

  sql += `
    ORDER BY
      CASE
        WHEN term = ? COLLATE NOCASE THEN 0
        WHEN term LIKE ? COLLATE NOCASE THEN 1
        ELSE 2
      END,
      term
    LIMIT ?
  `;

  params.push(searchTerm);        // For exact match check
  params.push(`${searchTerm}%`);  // For starts-with check
  params.push(String(MAX_RESULTS));

  // ─────────────────────────────────────────────────────────────────────────
  // EXECUTE QUERY
  // ─────────────────────────────────────────────────────────────────────────

  const rows = db.prepare(sql).all(...params) as Definition[];

  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADDITIONAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get exact definition
 *
 * Retrieves a specific definition by exact term and source.
 * Useful when you know exactly what you're looking for.
 *
 * @param db - Database connection
 * @param source - Source identifier
 * @param term - Exact term to look up
 * @returns Definition or null if not found
 *
 * @example
 * ```typescript
 * const def = await getExactDefinition(db, 'GDPR', 'personal data');
 * if (def) {
 *   console.log(def.definition);
 * }
 * ```
 */
export async function getExactDefinition(
  db: Database,
  source: string,
  term: string
): Promise<Definition | null> {
  const sql = `
    SELECT term, definition, source, defining_item
    FROM definitions
    WHERE source = ? AND term = ? COLLATE NOCASE
  `;

  const row = db.prepare(sql).get(source, term) as Definition | undefined;

  return row ?? null;
}

/**
 * List all definitions for a source
 *
 * Returns all definitions in a source, ordered alphabetically.
 * Useful for browsing all defined terms.
 *
 * @param db - Database connection
 * @param source - Source identifier
 * @returns All definitions in the source
 *
 * @example
 * ```typescript
 * const allDefs = await listDefinitions(db, 'GDPR');
 * console.log(`GDPR defines ${allDefs.length} terms`);
 * ```
 */
export async function listDefinitions(
  db: Database,
  source: string
): Promise<Definition[]> {
  const sql = `
    SELECT term, definition, source, defining_item
    FROM definitions
    WHERE source = ?
    ORDER BY term
  `;

  return db.prepare(sql).all(source) as Definition[];
}

/**
 * Compare definitions across sources
 *
 * Shows how different sources define the same term.
 * Useful for understanding differences in terminology.
 *
 * @param db - Database connection
 * @param term - Term to compare
 * @returns Definitions from all sources that define this term
 *
 * @example
 * ```typescript
 * const defs = await compareDefinitions(db, 'personal data');
 * // Returns GDPR's definition, NIS2's definition (if different), etc.
 *
 * for (const def of defs) {
 *   console.log(`${def.source}: ${def.definition}`);
 * }
 * ```
 */
export async function compareDefinitions(
  db: Database,
  term: string
): Promise<Definition[]> {
  // Look for exact matches across all sources
  const sql = `
    SELECT term, definition, source, defining_item
    FROM definitions
    WHERE term = ? COLLATE NOCASE
    ORDER BY source
  `;

  return db.prepare(sql).all(term) as Definition[];
}

/**
 * Find related definitions
 *
 * Finds definitions that are semantically related to a term.
 * Uses simple word overlap for now.
 *
 * @param db - Database connection
 * @param term - Term to find related definitions for
 * @param limit - Maximum results (default: 5)
 * @returns Related definitions
 *
 * @example
 * ```typescript
 * const related = await findRelatedDefinitions(db, 'data subject');
 * // Might return: personal data, data controller, data processor
 * ```
 */
export async function findRelatedDefinitions(
  db: Database,
  term: string,
  limit: number = 5
): Promise<Definition[]> {
  // Extract words from the term
  const words = term
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);  // Ignore short words

  if (words.length === 0) {
    return [];
  }

  // Build query that matches any of the words
  const conditions = words.map(() => `term LIKE ? COLLATE NOCASE`);

  const sql = `
    SELECT DISTINCT term, definition, source, defining_item
    FROM definitions
    WHERE (${conditions.join(' OR ')})
      AND term != ? COLLATE NOCASE
    ORDER BY term
    LIMIT ?
  `;

  const params = [
    ...words.map(w => `%${w}%`),
    term,
    limit,
  ];

  return db.prepare(sql).all(...params) as Definition[];
}
