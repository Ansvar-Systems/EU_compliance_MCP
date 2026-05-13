import type { DatabaseAdapter } from './database/types.js';

export interface HealthResult {
  status: 'ok' | 'degraded';
  server: string;
  db: 'ok' | 'error' | 'unexpected';
  dbError?: string;
}

const SERVER_NAME = 'eu-regulations-mcp';

// Runs a representative SELECT against the live DB so a TCP-only healthcheck
// won't mask SQL-layer failures like the 2026-05-01 WASM SQLite overlay lock.
// Accepts a thunk so DB-open failures surface in the same JSON shape as query failures.
export async function checkHealth(getDatabase: () => DatabaseAdapter): Promise<HealthResult> {
  let dbState: HealthResult['db'] = 'error';
  let dbError: string | undefined;
  try {
    const database = getDatabase();
    const result = await database.query<{ ok: number }>('SELECT 1 AS ok');
    dbState = result.rows.length === 1 && result.rows[0].ok === 1 ? 'ok' : 'unexpected';
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }
  const result: HealthResult = {
    status: dbState === 'ok' ? 'ok' : 'degraded',
    server: SERVER_NAME,
    db: dbState,
  };
  if (dbError) result.dbError = dbError;
  return result;
}

export function healthHttpStatus(result: HealthResult): number {
  return result.status === 'ok' ? 200 : 503;
}
