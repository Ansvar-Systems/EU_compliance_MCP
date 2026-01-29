import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPostgresAdapter } from '../../src/database/postgres-adapter.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe.skipIf(!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL)('PostgresAdapter', () => {
  let adapter: DatabaseAdapter;

  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!testUrl) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL required for tests');
    }
    adapter = await createPostgresAdapter(testUrl);
  });

  afterAll(async () => {
    await adapter.close();
  });

  it('should execute simple query', async () => {
    const result = await adapter.query('SELECT 1 as value');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].value).toBe(1);
  });

  it('should use parameterized queries', async () => {
    const result = await adapter.query(
      'SELECT $1::text as param',
      ['test-value']
    );
    expect(result.rows[0].param).toBe('test-value');
  });

  it('should search articles with FTS', async () => {
    const result = await adapter.query(
      `SELECT regulation, article_number
       FROM articles
       WHERE to_tsvector('english', COALESCE(title, '') || ' ' || text) @@ plainto_tsquery('english', $1)
       LIMIT 5`,
      ['incident reporting']
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
