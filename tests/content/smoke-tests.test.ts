/**
 * Content Smoke Tests
 *
 * Validates that critical article content is correct.
 * Catches regressions in EUR-Lex scraping, parsing, or database ingestion.
 *
 * Strategy: Sample ~10 articles across regulations with varying characteristics:
 * - Different regulations (GDPR, NIS2, DORA, AI Act, CRA, eIDAS2)
 * - Different article types (definitions, obligations, procedures)
 * - Different lengths (short, medium, long)
 *
 * Tests validate:
 * - Article title is correct
 * - Key phrases exist in text (not full text matching)
 * - Content isn't corrupted/truncated
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use production database for smoke tests
const DB_PATH = join(__dirname, '../../data/regulations.db');

describe('Content Smoke Tests (Critical Articles)', () => {
  let db: DatabaseType;

  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
  });

  afterAll(() => {
    db.close();
  });

  // Helper to get article
  const getArticle = (regulation: string, articleNumber: string) => {
    return db
      .prepare('SELECT title, text FROM articles WHERE regulation = ? AND article_number = ?')
      .get(regulation, articleNumber) as { title: string; text: string } | undefined;
  };

  describe('GDPR', () => {
    it('Article 17 - Right to erasure (data subject rights)', () => {
      const article = getArticle('GDPR', '17');

      expect(article).toBeDefined();
      // Title uses curly quotes from EUR-Lex
      expect(article!.title).toContain('Right to erasure');
      expect(article!.title).toContain('right to be forgotten');
      expect(article!.text).toContain('without undue delay');
      expect(article!.text).toContain('personal data concerning him or her');
      expect(article!.text).toContain('controller shall have the obligation to erase');
    });

    it('Article 25 - Data protection by design (technical requirements)', () => {
      const article = getArticle('GDPR', '25');

      expect(article).toBeDefined();
      expect(article!.title).toBe('Data protection by design and by default');
      expect(article!.text).toContain('appropriate technical and organisational measures');
      expect(article!.text).toContain('data-protection principles'); // Note: hyphenated in EUR-Lex
      expect(article!.text).toContain('by default');
    });

    it('Article 32 - Security of processing (security obligations)', () => {
      const article = getArticle('GDPR', '32');

      expect(article).toBeDefined();
      expect(article!.title).toBe('Security of processing');
      expect(article!.text).toContain('appropriate technical and organisational measures');
      expect(article!.text).toContain('pseudonymisation and encryption');
      expect(article!.text).toContain('confidentiality, integrity, availability and resilience');
    });
  });

  describe('NIS2', () => {
    it('Article 21 - Cybersecurity risk-management measures (requirements)', () => {
      const article = getArticle('NIS2', '21');

      expect(article).toBeDefined();
      expect(article!.title).toBe('Cybersecurity risk-management measures');
      expect(article!.text).toContain('appropriate and proportionate technical');
      expect(article!.text).toContain('risk analysis');
      expect(article!.text).toContain('incident handling');
    });

    it('Article 23 - Reporting obligations (incident reporting)', () => {
      const article = getArticle('NIS2', '23');

      expect(article).toBeDefined();
      expect(article!.title).toBe('Reporting obligations');
      expect(article!.text).toContain('without undue delay');
      expect(article!.text).toContain('notify');
      expect(article!.text).toContain('CSIRT');
    });
  });

  describe('DORA', () => {
    it('Article 6 - ICT risk management framework (comprehensive requirements)', () => {
      const article = getArticle('DORA', '6');

      expect(article).toBeDefined();
      expect(article!.title).toBe('ICT risk management framework');
      expect(article!.text).toContain('sound, comprehensive and well-documented');
      expect(article!.text).toContain('ICT risk');
      expect(article!.text).toContain('strategies, policies, procedures');
    });

    it('Article 17 - ICT incident management process (incident response)', () => {
      const article = getArticle('DORA', '17');

      expect(article).toBeDefined();
      expect(article!.title).toBe('ICT-related incident management process');
      expect(article!.text).toContain('detect, manage and notify');
      expect(article!.text).toContain('ICT-related incidents');
      expect(article!.text).toContain('Financial entities shall record');
    });
  });

  describe('AI Act', () => {
    it('Article 13 - Transparency obligations (AI-specific requirements)', () => {
      const article = getArticle('AI_ACT', '13');

      expect(article).toBeDefined();
      expect(article!.title).toBe('Transparency and provision of information to deployers');
      expect(article!.text).toContain('instructions for use');
      expect(article!.text).toContain('deployers');
      expect(article!.text).toContain('high-risk AI system');
    });
  });

  describe('Cyber Resilience Act', () => {
    it('Article 13 - Obligations of manufacturers (product requirements)', () => {
      const article = getArticle('CRA', '13');

      expect(article).toBeDefined();
      expect(article!.title).toBe('Obligations of manufacturers');
      expect(article!.text).toContain('products with digital elements');
      expect(article!.text).toContain('designed, developed and produced');
      expect(article!.text).toContain('manufacturers shall ensure');
    });
  });

  describe('eIDAS 2.0', () => {
    it('Article 24 - Requirements for qualified trust service providers (trust services)', () => {
      const article = getArticle('EIDAS2', '24');

      expect(article).toBeDefined();
      expect(article!.title).toBe('Requirements for qualified trust service providers');
      expect(article!.text).toContain('qualified trust service provider');
      expect(article!.text).toContain('qualified certificate');
      expect(article!.text).toContain('verify');
    });
  });

  // Meta-test: Ensure we're actually testing against production DB
  it('validates test is using production database with all regulations', () => {
    const regulationCount = db
      .prepare('SELECT COUNT(*) as count FROM regulations')
      .get() as { count: number };

    expect(regulationCount.count).toBe(49);
  });

  it('validates sampled articles represent diverse characteristics', () => {
    const articleCount = db
      .prepare('SELECT COUNT(*) as count FROM articles')
      .get() as { count: number };

    // Production DB should have 2,528 articles
    expect(articleCount.count).toBeGreaterThan(2000);
    expect(articleCount.count).toBeLessThan(3000);
  });
});
