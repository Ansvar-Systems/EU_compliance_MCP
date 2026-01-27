/**
 * PostgreSQL connection pool management
 */

import pg from 'pg';

export class DatabaseConnection {
  private pool: pg.Pool;
  private isConnected: boolean = false;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 20,                    // Maximum connections in pool
      idleTimeoutMillis: 30000,   // Close idle connections after 30s
      connectionTimeoutMillis: 2000, // Timeout if can't get connection in 2s
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }

  /**
   * Execute a SQL query with parameters
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }

  /**
   * Execute a query and return a single row
   */
  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute a query within a transaction
   */
  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as test');
      this.isConnected = result.length > 0 && result[0].test === 1;
      return this.isConnected;
    } catch (error) {
      console.error('Database connection test failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount
    };
  }
}

/**
 * Create a database connection from environment variable
 */
export function createConnection(): DatabaseConnection {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  return new DatabaseConnection(connectionString);
}
