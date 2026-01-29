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
    type: 'postgres' as const,

    async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
      const QUERY_TIMEOUT_MS = 10000; // 10 seconds

      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Database query timeout: Query exceeded 10 seconds'));
          }, QUERY_TIMEOUT_MS);
        });

        // Race between query and timeout
        const result = await Promise.race([
          pool.query(sql, params),
          timeoutPromise,
        ]);

        return {
          rows: result.rows as T[],
          rowCount: result.rowCount || 0,
        };
      } catch (error) {
        const pgError = error as {
          code?: string;
          message: string;
          detail?: string;
        };
        console.error('PostgreSQL query failed:', {
          sql: sql.substring(0, 100), // Truncate for logging
          params,
          code: pgError.code,
          message: pgError.message,
          detail: pgError.detail,
        });

        // Check for timeout error
        if (pgError.message?.includes('timeout')) {
          throw new Error(
            'Database query timeout: Query exceeded 10 seconds'
          );
        }

        // Provide helpful error messages based on error code
        if (pgError.code?.startsWith('08')) {
          throw new Error(`Database connection error: ${pgError.message}`);
        }
        if (pgError.code === '42P01') {
          throw new Error(`Table not found: ${pgError.message}`);
        }

        throw new Error(
          `Query failed: ${pgError.message}${pgError.code ? ` (${pgError.code})` : ''}`
        );
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
