/**
 * EU Regulations Core Package
 *
 * Shared business logic and database layer for all interfaces
 * (MCP server, REST API, CLI, etc.)
 */

// Database layer (low-level - prefer using adapters)
export { DatabaseConnection, createConnection, DatabaseQueries } from './database/index.js';

// Adapters (database abstraction)
export { createDatabaseAdapter, SQLiteAdapter, PostgreSQLAdapter } from './adapters/index.js';
export type { DatabaseAdapter } from './adapters/database-adapter.js';

// Services (business logic)
export { RegulationsService } from './services/index.js';

// Types
export * from './types/index.js';
