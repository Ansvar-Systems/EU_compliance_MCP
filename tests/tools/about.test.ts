import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { getAbout, type AboutContext } from '../../src/tools/about.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('getAbout', () => {
  let db: DatabaseAdapter;

  const testContext: AboutContext = {
    version: '1.0.0',
    fingerprint: 'abc123def456',
    dbBuilt: '2026-02-12T14:43:45.000Z',
  };

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it('returns structured server metadata', async () => {
    const result = await getAbout(db, testContext);

    expect(result.server).toEqual({
      name: 'EU Regulations MCP',
      package: '@ansvar/eu-regulations-mcp',
      version: '1.0.0',
      suite: 'Ansvar Compliance Suite',
      repository: 'https://github.com/Ansvar-Systems/EU_compliance_MCP',
    });
  });

  it('returns correct dataset counts from DB', async () => {
    const result = await getAbout(db, testContext);

    expect(result.dataset.counts.regulations).toBe(3);
    expect(result.dataset.counts.articles).toBe(14);
    expect(result.dataset.counts.recitals).toBe(4);
    expect(result.dataset.counts.definitions).toBe(4);
    expect(result.dataset.counts.control_mappings).toBe(10);
    expect(result.dataset.counts.applicability_rules).toBe(10);
    expect(result.dataset.counts.evidence_requirements).toBe(3);
  });

  it('returns fingerprint and build date from context', async () => {
    const result = await getAbout(db, testContext);

    expect(result.dataset.fingerprint).toBe('abc123def456');
    expect(result.dataset.built).toBe('2026-02-12T14:43:45.000Z');
  });

  it('returns freshness info from source_registry', async () => {
    const result = await getAbout(db, testContext);

    expect(result.dataset.freshness.source_registry_entries).toBe(3);
    expect(result.dataset.freshness.last_checked).toBe('2026-02-14T06:00:00Z');
    expect(result.dataset.freshness.check_method).toContain('EUR-Lex');
  });

  it('returns content_basis describing source material', async () => {
    const result = await getAbout(db, testContext);

    expect(result.dataset.content_basis).toContain('EUR-Lex consolidated texts');
    expect(result.dataset.content_basis).toContain('Not an official legal publication');
  });

  it('returns provenance with sources and authenticity note', async () => {
    const result = await getAbout(db, testContext);

    expect(result.provenance.sources).toContain('EUR-Lex');
    expect(result.provenance.sources).toContain('UNECE');
    expect(result.provenance.license).toContain('Apache-2.0');
    expect(result.provenance.authenticity_note).toContain('Official Journal');
    expect(result.provenance.authenticity_note).toContain('Article 297 TFEU');
  });

  it('declares read-only security posture', async () => {
    const result = await getAbout(db, testContext);

    expect(result.security).toEqual({
      access_model: 'read-only',
      network_access: false,
      filesystem_access: false,
      arbitrary_execution: false,
    });
  });

  it('returns EU jurisdiction', async () => {
    const result = await getAbout(db, testContext);

    expect(result.dataset.jurisdiction).toBe('EU');
  });
});
