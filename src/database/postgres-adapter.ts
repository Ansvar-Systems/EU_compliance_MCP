import pg from 'pg';
import type { DatabaseAdapter, QueryResult } from './types.js';

export async function createPostgresAdapter(
  connectionString: string
): Promise<DatabaseAdapter> {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Test connection
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    throw new Error(`Failed to connect to PostgreSQL: ${error}`);
  }

  return {
    async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
      try {
        const result = await pool.query(sql, params);
        return {
          rows: result.rows as T[],
          rowCount: result.rowCount || 0,
        };
      } catch (error) {
        console.error('Query failed:', sql, params, error);
        throw error;
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
