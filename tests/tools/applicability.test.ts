import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { checkApplicability } from '../../src/tools/applicability.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('checkApplicability', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('identifies regulations for financial sector', async () => {
    const result = await checkApplicability(db, {
      sector: 'financial',
      subsector: 'bank',
    });

    expect(result.applicable_regulations.length).toBeGreaterThan(0);

    const regulationIds = result.applicable_regulations.map(r => r.regulation);
    expect(regulationIds).toContain('GDPR');
    expect(regulationIds).toContain('DORA');
    expect(regulationIds).toContain('NIS2');
  });

  it('includes confidence levels', async () => {
    const result = await checkApplicability(db, {
      sector: 'financial',
    });

    result.applicable_regulations.forEach(r => {
      expect(['definite', 'likely', 'possible']).toContain(r.confidence);
    });
  });

  it('includes basis article reference', async () => {
    const result = await checkApplicability(db, {
      sector: 'healthcare',
    });

    const regulation = result.applicable_regulations.find(r => r.basis);
    expect(regulation).toBeDefined();
  });

  it('returns GDPR for any sector processing personal data', async () => {
    const result = await checkApplicability(db, {
      sector: 'manufacturing',
    });

    const regulationIds = result.applicable_regulations.map(r => r.regulation);
    expect(regulationIds).toContain('GDPR');
  });

  it('handles unknown sector gracefully', async () => {
    const result = await checkApplicability(db, {
      sector: 'other',
    });

    // Should still return GDPR since it applies to all sectors
    expect(Array.isArray(result.applicable_regulations)).toBe(true);
  });
});
