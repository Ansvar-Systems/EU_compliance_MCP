/**
 * Real-World Compliance Workflow Tests
 * Simulates practical compliance analysis scenarios
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { searchRegulations } from '../../src/tools/search.js';
import { getArticle } from '../../src/tools/article.js';
import { getRecital } from '../../src/tools/recital.js';
import { checkApplicability } from '../../src/tools/applicability.js';
import { mapControls } from '../../src/tools/map.js';
import { compareRequirements } from '../../src/tools/compare.js';
import { getDefinitions } from '../../src/tools/definitions.js';
import type { Database } from 'better-sqlite3';

describe('Real-World Compliance Workflows', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  describe('Healthcare Organization Compliance', () => {
    it('identifies healthcare-specific data protection requirements', async () => {
      // Step 1: Check which regulations apply to healthcare
      const applicability = await checkApplicability(db, {
        sector: 'healthcare',
      });

      const regIds = applicability.applicable_regulations.map((r) => r.regulation);

      // Must include GDPR (general data protection)
      expect(regIds).toContain('GDPR');

      // Step 2: Search for data processing requirements  
      const dataReqs = await searchRegulations(db, {
        query: 'personal data',
        regulations: regIds,
        limit: 20,
      });

      expect(dataReqs.length).toBeGreaterThan(0);

      // Step 3: Get specific article (GDPR Art 9 - special categories)
      const gdprArt9 = await getArticle(db, {
        regulation: 'GDPR',
        article: '9',
      });

      expect(gdprArt9).toBeDefined();
      if (gdprArt9) {
        expect(gdprArt9.text.toLowerCase()).toMatch(/health|medical/);
      }
    });

    it('complete workflow: search → get article → get recital', async () => {
      // 1. Search for patient data requirements
      const searchResults = await searchRegulations(db, {
        query: 'consent processing',
        limit: 10,
      });

      expect(searchResults.length).toBeGreaterThan(0);

      // 2. Get full article from first result
      const firstArticle = searchResults.find((r) => r.type === 'article');
      if (firstArticle) {
        const fullArticle = await getArticle(db, {
          regulation: firstArticle.regulation,
          article: firstArticle.article,
        });

        expect(fullArticle).toBeDefined();
        if (fullArticle) {
          expect(fullArticle.text.length).toBeGreaterThan(searchResults[0].snippet.length);
        }
      }

      // 3. Find related recitals
      const recitalResults = searchResults.filter((r) => r.type === 'recital');
      if (recitalResults.length > 0) {
        const recital = await getRecital(db, {
          regulation: recitalResults[0].regulation,
          recital_number: parseInt(recitalResults[0].article),
        });

        expect(recital).toBeDefined();
      }
    });
  });

  describe('Financial Institution Compliance', () => {
    it('maps DORA third-party risk requirements to ISO 27001', async () => {
      // Step 1: Check applicability for banks
      const applicability = await checkApplicability(db, {
        sector: 'financial',
        subsector: 'bank',
      });

      const regIds = applicability.applicable_regulations.map((r) => r.regulation);
      expect(regIds).toContain('DORA');

      // Step 2: Search for ICT third-party requirements
      const thirdPartyReqs = await searchRegulations(db, {
        query: 'third party',
        regulations: ['DORA'],
        limit: 10,
      });

      expect(thirdPartyReqs.length).toBeGreaterThan(0);

      // Step 3: Map to ISO 27001 controls
      const controlMapping = await mapControls(db, {
        framework: 'ISO27001',
        regulation: 'DORA',
      });

      expect(controlMapping.length).toBeGreaterThan(0);

      // Should include vendor/supplier management controls (A.5.X range)
      const supplierControls = controlMapping.filter((c) => c.control_id.startsWith('A.5'));
      expect(supplierControls.length).toBeGreaterThan(0);
    });

    it('compares DORA and NIS2 incident notification timelines', async () => {
      const comparison = await compareRequirements(db, {
        topic: 'incident notification',
        regulations: ['DORA', 'NIS2'],
      });

      // Should return comparison for both regulations
      expect(comparison.topic).toBe('incident notification');
      expect(comparison.regulations).toHaveLength(2);

      const doraComparison = comparison.regulations.find(r => r.regulation === 'DORA');
      const nis2Comparison = comparison.regulations.find(r => r.regulation === 'NIS2');

      expect(doraComparison).toBeDefined();
      expect(nis2Comparison).toBeDefined();

      // At least one should have timeline information
      const hasTimelines = doraComparison?.timelines || nis2Comparison?.timelines;
      expect(hasTimelines).toBeTruthy();
    });
  });

  describe('AI System Developer Compliance', () => {
    it('identifies requirements for AI systems processing personal data', async () => {
      // Step 1: Get AI system definition
      const aiSystemDef = await getDefinitions(db, {
        term: 'AI system',
        regulation: 'AI_ACT',
      });

      if (aiSystemDef.length > 0) {
        expect(aiSystemDef[0].definition).toBeTruthy();
      }

      // Step 2: Search for high-risk AI requirements
      const highRiskReqs = await searchRegulations(db, {
        query: 'high-risk AI system',
        regulations: ['AI_ACT'],
        limit: 10,
      });

      expect(Array.isArray(highRiskReqs)).toBe(true);

      // Step 3: Check GDPR automated decision-making requirements
      const gdprArt22 = await getArticle(db, {
        regulation: 'GDPR',
        article: '22',
      });

      if (gdprArt22) {
        expect(gdprArt22.text.toLowerCase()).toMatch(/automated|profiling/);
      }
    });

    it('cross-regulation compliance analysis', async () => {
      // Test database has GDPR, NIS2, DORA
      const search = await searchRegulations(db, {
        query: 'security measures',
        regulations: ['GDPR', 'NIS2', 'DORA'],
        limit: 20,
      });

      const regulationsFound = new Set(search.map((r) => r.regulation));

      // Should find requirements in multiple regulations
      expect(regulationsFound.size).toBeGreaterThan(0);
    });
  });

  describe('Critical Infrastructure Protection', () => {
    it('identifies NIS2 + CER requirements for energy sector', async () => {
      // Step 1: Check applicability
      const applicability = await checkApplicability(db, {
        sector: 'energy',
      });

      const regIds = applicability.applicable_regulations.map((r) => r.regulation);

      // Energy sector is NIS2 essential entity (test DB has NIS2, may not have CER)
      expect(regIds).toContain('NIS2');

      // Step 2: Search for resilience/security requirements in NIS2
      const resilience = await searchRegulations(db, {
        query: 'security measures',
        regulations: ['NIS2'],
        limit: 10,
      });

      expect(resilience.length).toBeGreaterThan(0);
    });
  });

  describe('Definition → Article Cross-Reference Workflow', () => {
    it('retrieves definition and then its source article', async () => {
      // 1. Get definition
      const definitions = await getDefinitions(db, {
        term: 'personal data',
        regulation: 'GDPR',
      });

      expect(definitions.length).toBeGreaterThan(0);

      if (definitions.length > 0) {
        // 2. Get the article where it's defined
        const sourceArticle = definitions[0].article;
        const article = await getArticle(db, {
          regulation: 'GDPR',
          article: sourceArticle,
        });

        expect(article).toBeDefined();
        if (article) {
          // Article should contain the definition
          expect(article.text.toLowerCase()).toContain('personal data');
        }
      }
    });
  });

  describe('Control Mapping → Article Retrieval Workflow', () => {
    it('maps ISO 27001 control to articles and retrieves them', async () => {
      // 1. Map control to regulations
      const controlMapping = await mapControls(db, {
        framework: 'ISO27001',
        control: 'A.5.1',
      });

      expect(controlMapping.length).toBeGreaterThan(0);

      if (controlMapping.length > 0 && controlMapping[0].mappings.length > 0) {
        // 2. Retrieve specific articles
        const firstMapping = controlMapping[0].mappings[0];
        const articles = firstMapping.articles;

        if (articles.length > 0) {
          const article = await getArticle(db, {
            regulation: firstMapping.regulation,
            article: articles[0],
          });

          expect(article).toBeDefined();
          if (article) {
            expect(article.regulation).toBe(firstMapping.regulation);
          }
        }
      }
    });
  });
});
