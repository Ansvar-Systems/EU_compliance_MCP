import type Database from '@ansvar/mcp-sqlite';
import type { DatabaseAdapter, QueryResult } from './types.js';

/**
 * Adapter that wraps better-sqlite3 Database to match DatabaseAdapter interface.
 * Allows existing SQLite-based entry points (stdio) to work with the new adapter interface.
 */
export function createSqliteAdapter(db: InstanceType<typeof Database>): DatabaseAdapter {
  return {
    type: 'sqlite' as const,

    async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
      try {
        // Convert PostgreSQL syntax to SQLite syntax
        let sqliteSql = sql
          // Convert $1, $2 placeholders to ?
          .replace(/\$\d+/g, '?')
          // Convert ILIKE to LIKE (SQLite is case-insensitive by default with LIKE)
          .replace(/\sILIKE\s/gi, ' LIKE ')
          // Convert ::TEXT type casting to CAST(... AS TEXT)
          .replace(/(\w+)::TEXT/g, 'CAST($1 AS TEXT)')
          .replace(/(\w+)::INTEGER/g, 'CAST($1 AS INTEGER)')
          // Convert DISTINCT ON (col) to GROUP BY col
          // PostgreSQL: SELECT DISTINCT ON (col1) col1, col2 FROM ... ORDER BY col1, col2
          // SQLite: SELECT col1, col2 FROM ... GROUP BY col1 HAVING MIN(col2) = col2
          .replace(/SELECT\s+DISTINCT\s+ON\s*\([^)]+\)/gi, 'SELECT');

        const stmt = db.prepare(sqliteSql);
        const rows = params ? stmt.all(...params) : stmt.all();
        return {
          rows: rows as T[],
          rowCount: rows.length,
        };
      } catch (error) {
        console.error('SQLite query failed:', sql, params, error);
        throw error;
      }
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}
