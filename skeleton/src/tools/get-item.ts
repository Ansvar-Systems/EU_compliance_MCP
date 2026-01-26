/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GET ITEM TOOL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Retrieves a specific item by its source and identifier.
 *
 * This tool is used when the user knows exactly which item they want.
 * Typically called after a search or list operation identifies the item.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * USE CASES
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   - "Show me GDPR Article 25"
 *   - "What does NIS2 Article 21 say?"
 *   - "Get the full text of Section 4 of the Data Protection Act"
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FEATURES
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   - Retrieves full text (not truncated like search results)
 *   - Includes metadata (parent, dates, etc.)
 *   - Optionally includes cross-references
 *   - Returns null if not found (not an error)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CUSTOMIZATION
 * ───────────────────────────────────────────────────────────────────────────
 *
 * To adapt for your server:
 *
 *   1. Update table/column names in the SQL query
 *   2. Modify the Item interface to match your schema
 *   3. Add any additional metadata fields you need
 *   4. Adjust JSON parsing for your stored formats
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @module tools/get-item
 * @author Ansvar Systems AB
 * @license Apache-2.0
 *
 * @example Basic retrieval
 * ```typescript
 * const article = await getItem(db, {
 *   source: 'GDPR',
 *   item_id: '25'
 * });
 * ```
 *
 * @example With cross-references
 * ```typescript
 * const article = await getItem(db, {
 *   source: 'GDPR',
 *   item_id: '25',
 *   include_related: true
 * });
 * ```
 *
 * @example MCP tool call
 * ```json
 * {
 *   "name": "get_item",
 *   "arguments": {
 *     "source": "GDPR",
 *     "item_id": "25",
 *     "include_related": true
 *   }
 * }
 * ```
 */

import type { Database } from 'better-sqlite3';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get item tool input parameters
 *
 * @property source - Source identifier (required)
 * @property item_id - Item identifier within source (required)
 * @property include_related - Include cross-referenced items (optional)
 */
export interface GetItemInput {
  /**
   * Source identifier
   *
   * This should match the 'id' column in your sources table.
   *
   * @example "GDPR", "NIS2", "BrB"
   */
  source: string;

  /**
   * Item identifier within the source
   *
   * Format depends on your data:
   *   - Regulations: "25" (article number)
   *   - Swedish law: "4:9c" (chapter:section)
   *   - Standards: "A.5.1" (control number)
   *
   * @example "25", "4:9c", "A.5.1"
   */
  item_id: string;

  /**
   * Include cross-referenced items
   *
   * When true, populates the 'related' field with brief info
   * about items that this item references.
   *
   * @default false
   */
  include_related?: boolean;
}

/**
 * Related item reference
 *
 * Brief information about a cross-referenced item.
 */
export interface RelatedItem {
  /** Relationship type */
  type: 'references' | 'referenced_by' | 'see_also' | 'implements';

  /** Source of related item */
  source: string;

  /** ID of related item */
  item_id: string;

  /** Title of related item (if available) */
  title?: string;
}

/**
 * Full item data
 *
 * Contains complete information about an item including
 * full text, metadata, and optionally related items.
 */
export interface Item {
  /** Source identifier */
  source: string;

  /** Item identifier within source */
  item_id: string;

  /** Item title (may be null) */
  title: string | null;

  /** Full text content */
  text: string;

  /** Parent element (e.g., chapter name) */
  parent: string | null;

  /**
   * Additional metadata
   *
   * Schema-specific fields stored as JSON.
   * May include: effective_date, amended_by, version, etc.
   */
  metadata: Record<string, unknown> | null;

  /**
   * Cross-referenced items
   *
   * Only populated when include_related is true.
   */
  related: RelatedItem[] | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE ROW TYPE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Raw database row structure
 *
 * Matches the columns returned by our SQL query.
 * JSON fields are stored as strings and need parsing.
 */
interface ItemRow {
  source: string;
  item_id: string;
  title: string | null;
  text: string;
  parent: string | null;
  metadata: string | null;  // JSON string
  related: string | null;   // JSON string
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a specific item by source and identifier
 *
 * Retrieves full item data from the database. Returns null if
 * the item doesn't exist (this is not considered an error).
 *
 * @param db - Database connection
 * @param input - Item identification parameters
 * @returns Full item data or null if not found
 *
 * @example
 * ```typescript
 * const db = getDb();
 *
 * // Basic retrieval
 * const article = await getItem(db, {
 *   source: 'GDPR',
 *   item_id: '25'
 * });
 *
 * if (article) {
 *   console.log(article.title);  // "Data protection by design..."
 *   console.log(article.text);   // Full article text
 * }
 *
 * // With cross-references
 * const article = await getItem(db, {
 *   source: 'GDPR',
 *   item_id: '33',
 *   include_related: true
 * });
 *
 * if (article?.related) {
 *   for (const ref of article.related) {
 *     console.log(`References ${ref.source} ${ref.item_id}`);
 *   }
 * }
 * ```
 */
export async function getItem(
  db: Database,
  input: GetItemInput
): Promise<Item | null> {
  // ─────────────────────────────────────────────────────────────────────────
  // VALIDATE INPUT
  // ─────────────────────────────────────────────────────────────────────────

  if (!input.source || input.source.trim().length === 0) {
    throw new Error('source is required');
  }

  if (!input.item_id || input.item_id.trim().length === 0) {
    throw new Error('item_id is required');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FETCH ITEM
  // ─────────────────────────────────────────────────────────────────────────
  // Query the items table for the specific source + item_id combination.
  // Returns null if no matching row found.
  // ─────────────────────────────────────────────────────────────────────────

  const sql = `
    SELECT
      source,
      item_id,
      title,
      text,
      parent,
      metadata,
      related
    FROM items
    WHERE source = ? AND item_id = ?
  `;

  const row = db.prepare(sql).get(
    input.source.trim(),
    input.item_id.trim()
  ) as ItemRow | undefined;

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLE NOT FOUND
  // ─────────────────────────────────────────────────────────────────────────
  // Returning null (not throwing) allows the AI to handle "not found"
  // gracefully without error handling.
  // ─────────────────────────────────────────────────────────────────────────

  if (!row) {
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PARSE JSON FIELDS
  // ─────────────────────────────────────────────────────────────────────────
  // Metadata and related are stored as JSON strings in SQLite.
  // Parse them into objects, handling null/empty values.
  // ─────────────────────────────────────────────────────────────────────────

  const metadata = parseJsonField<Record<string, unknown>>(row.metadata);

  // Only parse related if requested
  const related = input.include_related
    ? parseJsonField<RelatedItem[]>(row.related)
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  // BUILD RESPONSE
  // ─────────────────────────────────────────────────────────────────────────

  const item: Item = {
    source: row.source,
    item_id: row.item_id,
    title: row.title,
    text: row.text,
    parent: row.parent,
    metadata,
    related,
  };

  return item;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Safely parse a JSON string field
 *
 * Handles null, empty strings, and invalid JSON gracefully.
 *
 * @param value - JSON string or null
 * @returns Parsed value or null
 *
 * @example
 * ```typescript
 * parseJsonField('{"a": 1}');  // { a: 1 }
 * parseJsonField(null);        // null
 * parseJsonField('');          // null
 * parseJsonField('invalid');   // null (logs warning)
 * ```
 */
function parseJsonField<T>(value: string | null): T | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    // Log but don't throw - return null for invalid JSON
    console.error(`Warning: Failed to parse JSON field: ${value}`);
    return null;
  }
}

/**
 * Get multiple items by their identifiers
 *
 * Batch retrieval for efficiency when you need multiple items.
 * Returns items in the same order as the input identifiers.
 * Missing items are represented as null in the result array.
 *
 * @param db - Database connection
 * @param identifiers - Array of { source, item_id } to retrieve
 * @returns Array of items (null for not found)
 *
 * @example
 * ```typescript
 * const items = await getItems(db, [
 *   { source: 'GDPR', item_id: '25' },
 *   { source: 'GDPR', item_id: '32' },
 *   { source: 'NIS2', item_id: '21' }
 * ]);
 * // Returns: [Item, Item, Item] or [Item, null, Item] if one is missing
 * ```
 */
export async function getItems(
  db: Database,
  identifiers: Array<{ source: string; item_id: string }>
): Promise<Array<Item | null>> {
  // For small batches, sequential retrieval is fine
  // For large batches, consider a single query with IN clause
  return Promise.all(
    identifiers.map(id => getItem(db, { source: id.source, item_id: id.item_id }))
  );
}
