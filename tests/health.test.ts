import { describe, it, expect } from 'vitest';
import { checkHealth, healthHttpStatus, type HealthResult } from '../src/health.js';
import type { DatabaseAdapter, QueryResult } from '../src/database/types.js';

function fakeDb(queryImpl: () => Promise<QueryResult<any>>): DatabaseAdapter {
  return {
    type: 'sqlite',
    query: async () => queryImpl(),
    close: async () => {},
  };
}

describe('checkHealth', () => {
  it('returns ok when SELECT 1 succeeds', async () => {
    const result = await checkHealth(() =>
      fakeDb(async () => ({ rows: [{ ok: 1 }], rowCount: 1 }))
    );
    expect(result.status).toBe('ok');
    expect(result.db).toBe('ok');
    expect(result.dbError).toBeUndefined();
    expect(healthHttpStatus(result)).toBe(200);
  });

  it('returns degraded with dbError when query throws (the masked-bug case)', async () => {
    const result = await checkHealth(() =>
      fakeDb(async () => {
        throw new Error('SQLite3Error: database is locked');
      })
    );
    expect(result.status).toBe('degraded');
    expect(result.db).toBe('error');
    expect(result.dbError).toContain('database is locked');
    expect(healthHttpStatus(result)).toBe(503);
  });

  it('returns degraded when DB-open thunk throws', async () => {
    const result = await checkHealth(() => {
      throw new Error('Failed to open database at /app/data/regulations.db');
    });
    expect(result.status).toBe('degraded');
    expect(result.db).toBe('error');
    expect(result.dbError).toContain('Failed to open database');
    expect(healthHttpStatus(result)).toBe(503);
  });

  it('returns degraded with db=unexpected when SELECT 1 returns nothing', async () => {
    const result = await checkHealth(() =>
      fakeDb(async () => ({ rows: [], rowCount: 0 }))
    );
    expect(result.status).toBe('degraded');
    expect(result.db).toBe('unexpected');
    expect(result.dbError).toBeUndefined();
    expect(healthHttpStatus(result)).toBe(503);
  });

  it('reports server name in payload', async () => {
    const result: HealthResult = await checkHealth(() =>
      fakeDb(async () => ({ rows: [{ ok: 1 }], rowCount: 1 }))
    );
    expect(result.server).toBe('eu-regulations-mcp');
  });
});
