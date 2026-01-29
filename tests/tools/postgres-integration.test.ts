import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPostgresAdapter } from '../../src/database/postgres-adapter.js';
import type { DatabaseAdapter } from '../../src/database/types.js';
import { searchRegulations } from '../../src/tools/search.js';
import { getArticle } from '../../src/tools/article.js';
import { getRecital } from '../../src/tools/recital.js';
import { listRegulations } from '../../src/tools/list.js';
import { getDefinitions } from '../../src/tools/definitions.js';
import { checkApplicability } from '../../src/tools/applicability.js';
import { mapControls } from '../../src/tools/map.js';

describe('MCP Tools with PostgreSQL', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL environment variable is required for integration tests');
    }
    db = await createPostgresAdapter(url);
  });

  afterAll(async () => {
    await db.close();
  });

  describe('search_regulations', () => {
    it('should search for articles containing "data breach"', async () => {
      const results = await searchRegulations(db, {
        query: 'data breach',
        limit: 5,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('regulation');
      expect(results[0]).toHaveProperty('article');
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('snippet');
      expect(results[0]).toHaveProperty('relevance');
    });

    it('should filter by regulation', async () => {
      const results = await searchRegulations(db, {
        query: 'incident reporting',
        regulations: ['GDPR', 'NIS2'],
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(['GDPR', 'NIS2']).toContain(result.regulation);
      });
    });

    it('should return empty array for non-existent terms', async () => {
      const results = await searchRegulations(db, {
        query: 'zzzznonexistent99999',
        limit: 5,
      });

      expect(results).toEqual([]);
    });
  });

  describe('get_article', () => {
    it('should retrieve GDPR Article 33 (breach notification)', async () => {
      const article = await getArticle(db, {
        regulation: 'GDPR',
        article: '33',
      });

      expect(article).not.toBeNull();
      expect(article?.regulation).toBe('GDPR');
      expect(article?.article_number).toBe('33');
      expect(article?.text).toContain('personal data breach');
    });

    it('should return null for non-existent article', async () => {
      const article = await getArticle(db, {
        regulation: 'GDPR',
        article: '999',
      });

      expect(article).toBeNull();
    });

    it('should handle JSON fields correctly', async () => {
      const article = await getArticle(db, {
        regulation: 'GDPR',
        article: '5',
      });

      expect(article).not.toBeNull();
      // Some articles may have recitals or cross_references
      if (article?.recitals) {
        expect(Array.isArray(article.recitals)).toBe(true);
      }
      if (article?.cross_references) {
        expect(Array.isArray(article.cross_references)).toBe(true);
      }
    });
  });

  describe('get_recital', () => {
    it('should retrieve a recital', async () => {
      const recital = await getRecital(db, {
        regulation: 'GDPR',
        recital_number: 1,
      });

      expect(recital).not.toBeNull();
      expect(recital?.regulation).toBe('GDPR');
      expect(recital?.recital_number).toBe(1);
      expect(recital?.text).toBeTruthy();
    });

    it('should return null for non-existent recital', async () => {
      const recital = await getRecital(db, {
        regulation: 'GDPR',
        recital_number: 9999,
      });

      expect(recital).toBeNull();
    });

    it('should validate recital number bounds', async () => {
      const invalidNegative = await getRecital(db, {
        regulation: 'GDPR',
        recital_number: -1,
      });

      expect(invalidNegative).toBeNull();

      const invalidHuge = await getRecital(db, {
        regulation: 'GDPR',
        recital_number: 99999,
      });

      expect(invalidHuge).toBeNull();
    });
  });

  describe('list_regulations', () => {
    it('should list all regulations', async () => {
      const result = await listRegulations(db, {});

      expect(result.regulations.length).toBeGreaterThan(0);
      const gdpr = result.regulations.find(r => r.id === 'GDPR');
      expect(gdpr).toBeDefined();
      expect(gdpr?.full_name).toContain('General Data Protection');
      expect(gdpr?.article_count).toBeGreaterThan(0);
    });

    it('should show detailed structure for specific regulation', async () => {
      const result = await listRegulations(db, {
        regulation: 'GDPR',
      });

      expect(result.regulations.length).toBe(1);
      const gdpr = result.regulations[0];
      expect(gdpr.id).toBe('GDPR');
      expect(gdpr.chapters).toBeDefined();
      expect(gdpr.chapters!.length).toBeGreaterThan(0);
    });

    it('should return empty for non-existent regulation', async () => {
      const result = await listRegulations(db, {
        regulation: 'NONEXISTENT',
      });

      expect(result.regulations).toEqual([]);
    });
  });

  describe('get_definitions', () => {
    it('should find definitions for "personal data"', async () => {
      const definitions = await getDefinitions(db, {
        term: 'personal data',
      });

      expect(definitions.length).toBeGreaterThan(0);
      const gdprDef = definitions.find(d => d.regulation === 'GDPR');
      expect(gdprDef).toBeDefined();
      expect(gdprDef?.definition).toBeTruthy();
    });

    it('should filter by regulation', async () => {
      const definitions = await getDefinitions(db, {
        term: 'data',
        regulation: 'GDPR',
      });

      expect(definitions.length).toBeGreaterThan(0);
      definitions.forEach(def => {
        expect(def.regulation).toBe('GDPR');
      });
    });

    it('should handle case-insensitive search', async () => {
      const definitions = await getDefinitions(db, {
        term: 'PERSONAL DATA',
      });

      expect(definitions.length).toBeGreaterThan(0);
    });
  });

  describe('check_applicability', () => {
    it('should identify regulations for financial sector', async () => {
      const result = await checkApplicability(db, {
        sector: 'financial',
      });

      expect(result.applicable_regulations.length).toBeGreaterThan(0);
      // DORA should definitely apply to financial sector
      const dora = result.applicable_regulations.find(r => r.regulation === 'DORA');
      expect(dora).toBeDefined();
      expect(dora?.confidence).toBe('definite');
    });

    it('should support subsector filtering', async () => {
      const result = await checkApplicability(db, {
        sector: 'financial',
        subsector: 'bank',
      });

      expect(result.applicable_regulations.length).toBeGreaterThan(0);
    });

    it('should provide summary when requested', async () => {
      const result = await checkApplicability(db, {
        sector: 'healthcare',
        detail_level: 'summary',
      });

      expect(result.summary).toBeDefined();
      expect(result.summary?.total_count).toBeGreaterThan(0);
      expect(result.summary?.by_confidence).toBeDefined();
      expect(result.summary?.regulations_summary).toBeDefined();
    });
  });

  describe('map_controls', () => {
    it('should list ISO27001 controls', async () => {
      const mappings = await mapControls(db, {
        framework: 'ISO27001',
      });

      expect(mappings.length).toBeGreaterThan(0);
      expect(mappings[0]).toHaveProperty('control_id');
      expect(mappings[0]).toHaveProperty('control_name');
      expect(mappings[0]).toHaveProperty('mappings');
    });

    it('should filter by specific control', async () => {
      const mappings = await mapControls(db, {
        framework: 'ISO27001',
        control: 'A.5.1',
      });

      expect(mappings.length).toBeGreaterThan(0);
      mappings.forEach(m => {
        expect(m.control_id).toBe('A.5.1');
      });
    });

    it('should filter by regulation', async () => {
      const mappings = await mapControls(db, {
        framework: 'ISO27001',
        regulation: 'GDPR',
      });

      expect(mappings.length).toBeGreaterThan(0);
      mappings.forEach(m => {
        m.mappings.forEach(mapping => {
          expect(mapping.regulation).toBe('GDPR');
        });
      });
    });

    it('should list NIST CSF controls', async () => {
      const mappings = await mapControls(db, {
        framework: 'NIST_CSF',
      });

      expect(mappings.length).toBeGreaterThan(0);
    });
  });

  describe('PostgreSQL-specific features', () => {
    it('should use full-text search with ranking', async () => {
      const result = await db.query(
        `SELECT article_number, title,
                ts_rank(to_tsvector('english', text), plainto_tsquery('english', $1)) as rank
         FROM articles
         WHERE to_tsvector('english', text) @@ plainto_tsquery('english', $1)
         AND regulation = $2
         ORDER BY rank DESC
         LIMIT 5`,
        ['incident', 'GDPR']
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveProperty('rank');
    });

    it('should handle ILIKE for case-insensitive matching', async () => {
      const result = await db.query(
        `SELECT term, regulation
         FROM definitions
         WHERE term ILIKE $1
         LIMIT 5`,
        ['%personal%']
      );

      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should cast types correctly', async () => {
      const result = await db.query(
        `SELECT article_number, article_number::INTEGER as article_int
         FROM articles
         WHERE regulation = $1
         ORDER BY article_number::INTEGER
         LIMIT 5`,
        ['GDPR']
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(typeof result.rows[0].article_int).toBe('number');
    });
  });
});
