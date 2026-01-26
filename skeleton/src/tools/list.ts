/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LIST TOOL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lists available sources and their contents for browsing and discovery.
 *
 * This tool helps users understand what data is available before
 * searching or retrieving specific items. It provides two modes:
 *
 *   1. List all sources (no arguments)
 *   2. List items within a specific source
 *
 * ───────────────────────────────────────────────────────────────────────────
 * USE CASES
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   - "What regulations are available?"
 *   - "Show me the structure of GDPR"
 *   - "List all chapters in NIS2"
 *   - "What's in Chapter 3 of DORA?"
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESIGN CONSIDERATIONS
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The list tool should:
 *
 *   - Be fast (users call this frequently)
 *   - Return summary info, not full content
 *   - Support hierarchical browsing (source → chapter → items)
 *   - Include counts to help users understand scope
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CUSTOMIZATION
 * ───────────────────────────────────────────────────────────────────────────
 *
 * To adapt for your server:
 *
 *   1. Update table/column names in SQL queries
 *   2. Modify SourceSummary/ItemSummary to match your schema
 *   3. Add any hierarchical levels specific to your data
 *   4. Consider adding pagination for large item lists
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @module tools/list
 * @author Ansvar Systems AB
 * @license Apache-2.0
 *
 * @example List all sources
 * ```typescript
 * const result = await listSources(db, {});
 * // Returns: { sources: [{ id: 'GDPR', ... }, { id: 'NIS2', ... }] }
 * ```
 *
 * @example List items in a source
 * ```typescript
 * const result = await listSources(db, { source: 'GDPR' });
 * // Returns: { items: [{ item_id: '1', title: '...', parent: 'Chapter I' }, ...] }
 * ```
 *
 * @example MCP tool call
 * ```json
 * {
 *   "name": "list_sources",
 *   "arguments": {
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
 * List tool input parameters
 *
 * All parameters are optional:
 *   - No parameters: List all sources
 *   - source: List items in that source
 *   - source + parent: List items under that parent
 */
export interface ListInput {
  /**
   * Source to list items from
   *
   * When omitted, returns list of all available sources.
   * When provided, returns items within that source.
   *
   * @example "GDPR", "NIS2"
   */
  source?: string;

  /**
   * Filter to items under this parent
   *
   * Enables hierarchical browsing. For example:
   *   - source="GDPR", parent="Chapter III" → Articles in Chapter III
   *
   * @example "Chapter III", "Part 2"
   */
  parent?: string;
}

/**
 * Summary information about a source
 *
 * Returned when listing all sources (no source specified).
 */
export interface SourceSummary {
  /** Source identifier */
  id: string;

  /** Full name of the source */
  full_name: string;

  /** Official identifier (CELEX, SFS number, etc.) */
  identifier: string | null;

  /** Total number of items in this source */
  item_count: number;

  /** Number of definitions in this source */
  definition_count: number;
}

/**
 * Summary information about an item
 *
 * Returned when listing items within a source.
 * Intentionally brief - use get_item for full content.
 */
export interface ItemSummary {
  /** Item identifier */
  item_id: string;

  /** Item title (may be null) */
  title: string | null;

  /** Parent element (chapter, part, etc.) */
  parent: string | null;
}

/**
 * List tool result
 *
 * Contains either sources or items, depending on input.
 */
export interface ListResult {
  /** List of sources (when no source specified in input) */
  sources?: SourceSummary[];

  /** List of items (when source specified in input) */
  items?: ItemSummary[];

  /** Distinct parent values for hierarchical browsing */
  parents?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List available sources and their contents
 *
 * Provides two modes of operation:
 *
 * 1. **List sources** (no source parameter):
 *    Returns all available sources with item counts.
 *
 * 2. **List items** (source parameter provided):
 *    Returns items within the specified source.
 *    Optionally filter by parent for hierarchical browsing.
 *
 * @param db - Database connection
 * @param input - Optional filtering parameters
 * @returns Sources or items depending on input
 *
 * @example
 * ```typescript
 * const db = getDb();
 *
 * // List all sources
 * const allSources = await listSources(db, {});
 * console.log(allSources.sources);
 * // [{ id: 'GDPR', full_name: '...', item_count: 99 }, ...]
 *
 * // List items in GDPR
 * const gdprItems = await listSources(db, { source: 'GDPR' });
 * console.log(gdprItems.items);
 * // [{ item_id: '1', title: 'Subject matter and objectives', parent: 'Chapter I' }, ...]
 *
 * // List items in a specific chapter
 * const chapterItems = await listSources(db, {
 *   source: 'GDPR',
 *   parent: 'Chapter III'
 * });
 * ```
 */
export async function listSources(
  db: Database,
  input: ListInput
): Promise<ListResult> {
  // ─────────────────────────────────────────────────────────────────────────
  // MODE 1: LIST ALL SOURCES
  // ─────────────────────────────────────────────────────────────────────────
  // When no source specified, return overview of all available sources.
  // ─────────────────────────────────────────────────────────────────────────

  if (!input.source) {
    return listAllSources(db);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 2: LIST ITEMS IN SOURCE
  // ─────────────────────────────────────────────────────────────────────────
  // When source specified, return items within that source.
  // ─────────────────────────────────────────────────────────────────────────

  return listItemsInSource(db, input.source, input.parent);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List all available sources with summary statistics
 *
 * @param db - Database connection
 * @returns List of source summaries
 */
async function listAllSources(db: Database): Promise<ListResult> {
  // ─────────────────────────────────────────────────────────────────────────
  // Query sources with item and definition counts
  //
  // Uses LEFT JOINs to include sources even if they have no items/definitions.
  // GROUP BY aggregates the counts per source.
  // ─────────────────────────────────────────────────────────────────────────

  const sql = `
    SELECT
      s.id,
      s.full_name,
      s.identifier,
      COUNT(DISTINCT i.rowid) as item_count,
      COUNT(DISTINCT d.id) as definition_count
    FROM sources s
    LEFT JOIN items i ON i.source = s.id
    LEFT JOIN definitions d ON d.source = s.id
    GROUP BY s.id
    ORDER BY s.id
  `;

  const rows = db.prepare(sql).all() as SourceSummary[];

  return { sources: rows };
}

/**
 * List items within a specific source
 *
 * @param db - Database connection
 * @param source - Source identifier to list items from
 * @param parent - Optional parent filter for hierarchical browsing
 * @returns List of item summaries and available parents
 */
async function listItemsInSource(
  db: Database,
  source: string,
  parent?: string
): Promise<ListResult> {
  // ─────────────────────────────────────────────────────────────────────────
  // VERIFY SOURCE EXISTS
  // ─────────────────────────────────────────────────────────────────────────

  const sourceExists = db.prepare(
    'SELECT 1 FROM sources WHERE id = ?'
  ).get(source);

  if (!sourceExists) {
    // Return empty result for unknown source (not an error)
    return { items: [], parents: [] };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET DISTINCT PARENTS
  // ─────────────────────────────────────────────────────────────────────────
  // Provides the hierarchical structure for browsing.
  // ─────────────────────────────────────────────────────────────────────────

  const parentsRows = db.prepare(`
    SELECT DISTINCT parent
    FROM items
    WHERE source = ? AND parent IS NOT NULL
    ORDER BY parent
  `).all(source) as Array<{ parent: string }>;

  const parents = parentsRows.map(r => r.parent);

  // ─────────────────────────────────────────────────────────────────────────
  // GET ITEMS
  // ─────────────────────────────────────────────────────────────────────────
  // Optionally filtered by parent for hierarchical browsing.
  // ─────────────────────────────────────────────────────────────────────────

  let itemsSql = `
    SELECT item_id, title, parent
    FROM items
    WHERE source = ?
  `;

  const params: string[] = [source];

  if (parent) {
    itemsSql += ` AND parent = ?`;
    params.push(parent);
  }

  itemsSql += ` ORDER BY item_id`;

  const items = db.prepare(itemsSql).all(...params) as ItemSummary[];

  return { items, parents };
}

/**
 * Get source metadata
 *
 * Utility function to retrieve full metadata for a single source.
 *
 * @param db - Database connection
 * @param sourceId - Source identifier
 * @returns Source metadata or null if not found
 *
 * @example
 * ```typescript
 * const gdpr = await getSourceMetadata(db, 'GDPR');
 * console.log(gdpr?.full_name);  // "General Data Protection Regulation"
 * ```
 */
export async function getSourceMetadata(
  db: Database,
  sourceId: string
): Promise<SourceSummary | null> {
  const sql = `
    SELECT
      s.id,
      s.full_name,
      s.identifier,
      COUNT(DISTINCT i.rowid) as item_count,
      COUNT(DISTINCT d.id) as definition_count
    FROM sources s
    LEFT JOIN items i ON i.source = s.id
    LEFT JOIN definitions d ON d.source = s.id
    WHERE s.id = ?
    GROUP BY s.id
  `;

  const row = db.prepare(sql).get(sourceId) as SourceSummary | undefined;

  return row ?? null;
}

/**
 * Get hierarchical structure of a source
 *
 * Returns the full hierarchy with nested items.
 * Useful for generating table of contents.
 *
 * @param db - Database connection
 * @param sourceId - Source identifier
 * @returns Hierarchical structure
 *
 * @example
 * ```typescript
 * const structure = await getSourceStructure(db, 'GDPR');
 * // Returns:
 * // {
 * //   source: 'GDPR',
 * //   chapters: [
 * //     {
 * //       name: 'Chapter I',
 * //       items: [{ item_id: '1', title: '...' }, ...]
 * //     },
 * //     ...
 * //   ]
 * // }
 * ```
 */
export async function getSourceStructure(
  db: Database,
  sourceId: string
): Promise<{
  source: string;
  chapters: Array<{
    name: string;
    items: ItemSummary[];
  }>;
}> {
  // Get all items grouped by parent
  const items = db.prepare(`
    SELECT item_id, title, parent
    FROM items
    WHERE source = ?
    ORDER BY parent, item_id
  `).all(sourceId) as ItemSummary[];

  // Group by parent (chapter)
  const chapters = new Map<string, ItemSummary[]>();

  for (const item of items) {
    const parent = item.parent || '(No Chapter)';
    if (!chapters.has(parent)) {
      chapters.set(parent, []);
    }
    chapters.get(parent)!.push(item);
  }

  return {
    source: sourceId,
    chapters: Array.from(chapters.entries()).map(([name, items]) => ({
      name,
      items,
    })),
  };
}
