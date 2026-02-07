/**
 * PostgreSQL connection pool management
 */

import pg from 'pg';
import fs from 'fs';

/**
 * Determines SSL configuration based on environment variables.
 *
 * SSL Modes (via DATABASE_SSL_MODE):
 * - "require" (default in production): Use SSL with certificate validation
 * - "verify-ca": Verify server certificate against custom CA (requires DATABASE_SSL_CA_CERT)
 * - "allow": Try SSL first, fallback to non-SSL (not recommended for production)
 * - "disable": No SSL (only for local development)
 *
 * Environment Variables:
 * - DATABASE_SSL_MODE: SSL mode (default: "require" if NODE_ENV=production, else "disable")
 * - DATABASE_SSL_CA_CERT: Path to custom CA certificate file (for self-signed certs)
 * - DATABASE_SSL_REJECT_UNAUTHORIZED: Legacy override (use DATABASE_SSL_MODE instead)
 */
function getSSLConfig(): pg.ConnectionConfig['ssl'] {
  const sslMode = process.env.DATABASE_SSL_MODE?.toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';

  // Legacy support for rejectUnauthorized env var (with deprecation warning)
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
    console.warn(
      '⚠️  SECURITY WARNING: DATABASE_SSL_REJECT_UNAUTHORIZED=false is deprecated and insecure.\n' +
      '   Use DATABASE_SSL_MODE=disable for local dev, or DATABASE_SSL_MODE=verify-ca with DATABASE_SSL_CA_CERT for custom CAs.\n' +
      '   See: https://github.com/Ansvar-Systems/EU_compliance_MCP/blob/main/docs/DATABASE_SSL.md'
    );
    return { rejectUnauthorized: false };
  }

  // Handle explicit SSL modes
  switch (sslMode) {
    case 'disable':
      if (isProduction) {
        console.warn(
          '⚠️  SECURITY WARNING: DATABASE_SSL_MODE=disable in production exposes data to interception.\n' +
          '   Only use this for local development or private networks.\n' +
          '   Managed Postgres providers (Neon, Supabase, AWS RDS) use valid certificates - use "require" instead.'
        );
      }
      return undefined;

    case 'allow':
      console.warn(
        '⚠️  SECURITY NOTICE: DATABASE_SSL_MODE=allow may fallback to unencrypted connections.\n' +
        '   Use "require" for production environments.'
      );
      return { rejectUnauthorized: true };

    case 'verify-ca': {
      const caPath = process.env.DATABASE_SSL_CA_CERT;
      if (!caPath) {
        throw new Error(
          'DATABASE_SSL_MODE=verify-ca requires DATABASE_SSL_CA_CERT environment variable.\n' +
          'Set it to the path of your custom CA certificate file.'
        );
      }
      if (!fs.existsSync(caPath)) {
        throw new Error(`DATABASE_SSL_CA_CERT file not found: ${caPath}`);
      }
      return {
        rejectUnauthorized: true,
        ca: fs.readFileSync(caPath, 'utf-8')
      };
    }

    case 'require':
      // Secure default: validates against system CA certificates
      return { rejectUnauthorized: true };

    default:
      // Auto-detect: secure in production, disabled in development
      if (isProduction) {
        return { rejectUnauthorized: true };
      }
      return undefined;
  }
}

export class DatabaseConnection {
  private pool: pg.Pool;
  private isConnected: boolean = false;

  constructor(connectionString: string) {
    const sslConfig = getSSLConfig();

    this.pool = new pg.Pool({
      connectionString,
      max: 20,                    // Maximum connections in pool
      idleTimeoutMillis: 30000,   // Close idle connections after 30s
      connectionTimeoutMillis: 2000, // Timeout if can't get connection in 2s
      ssl: sslConfig
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
