import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { mapControls } from '../../src/tools/map.js';
import type { Database } from 'better-sqlite3';

describe('mapControls', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('maps a specific ISO 27001 control to regulations', async () => {
    const result = await mapControls(db, {
      framework: 'ISO27001',
      control: 'A.5.1',
    });

    expect(result).toHaveLength(1);
    expect(result[0].control_id).toBe('A.5.1');
    expect(result[0].control_name).toBe('Policies for information security');
    expect(result[0].mappings.length).toBeGreaterThan(0);
  });

  it('returns all controls when no specific control requested', async () => {
    const result = await mapControls(db, {
      framework: 'ISO27001',
    });

    // Test data has 2 unique controls
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('filters mappings by regulation', async () => {
    const result = await mapControls(db, {
      framework: 'ISO27001',
      control: 'A.6.8',
      regulation: 'GDPR',
    });

    expect(result).toHaveLength(1);
    expect(result[0].mappings).toHaveLength(1);
    expect(result[0].mappings[0].regulation).toBe('GDPR');
  });

  it('includes coverage level in mappings', async () => {
    const result = await mapControls(db, {
      framework: 'ISO27001',
      control: 'A.5.1',
    });

    const mapping = result[0].mappings[0];
    expect(['full', 'partial', 'related']).toContain(mapping.coverage);
  });

  it('returns empty for unknown control', async () => {
    const result = await mapControls(db, {
      framework: 'ISO27001',
      control: 'A.99.99',
    });

    expect(result).toHaveLength(0);
  });
});
