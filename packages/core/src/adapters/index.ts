/**
 * Database Adapter Factory
 *
 * Automatically chooses the right adapter based on environment configuration.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { DatabaseAdapter } from './database-adapter.js';
import { SQLiteAdapter } from './sqlite-adapter.js';
import { PostgreSQLAdapter } from './postgresql-adapter.js';

/**
 * Create database adapter based on environment
 *
 * - If DATABASE_URL is set → PostgreSQL adapter
 * - Otherwise → SQLite adapter (default for MCP server)
 */
export function createDatabaseAdapter(): DatabaseAdapter {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    // PostgreSQL mode (Teams/Copilot integration)
    console.log('📊 Using PostgreSQL adapter');
    return new PostgreSQLAdapter(databaseUrl);
  } else {
    // SQLite mode (MCP server, default)
    console.log('📊 Using SQLite adapter');

    // Default path: data/regulations.db relative to package root
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const dbPath = process.env.SQLITE_DB_PATH || join(__dirname, '../../../../data/regulations.db');

    return new SQLiteAdapter(dbPath);
  }
}

export type { DatabaseAdapter };
export { SQLiteAdapter } from './sqlite-adapter.js';
export { PostgreSQLAdapter } from './postgresql-adapter.js';
