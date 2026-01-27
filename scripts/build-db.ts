#!/usr/bin/env npx tsx

/**
 * Build the regulations.db SQLite database from seed JSON files.
 * Run with: npm run build:db
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', 'data');
const SEED_DIR = join(DATA_DIR, 'seed');
const DB_PATH = join(DATA_DIR, 'regulations.db');

const SCHEMA = `
-- Core regulation metadata
CREATE TABLE IF NOT EXISTS regulations (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  celex_id TEXT NOT NULL,
  effective_date TEXT,
  last_amended TEXT,
  eur_lex_url TEXT
);

-- Articles table
CREATE TABLE IF NOT EXISTS articles (
  rowid INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  article_number TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  chapter TEXT,
  recitals TEXT,
  cross_references TEXT,
  UNIQUE(regulation, article_number)
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  regulation,
  article_number,
  title,
  text,
  content='articles',
  content_rowid='rowid'
);

-- FTS5 triggers
CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, regulation, article_number, title, text)
  VALUES (new.rowid, new.regulation, new.article_number, new.title, new.text);
END;

CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, regulation, article_number, title, text)
  VALUES('delete', old.rowid, old.regulation, old.article_number, old.title, old.text);
END;

CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, regulation, article_number, title, text)
  VALUES('delete', old.rowid, old.regulation, old.article_number, old.title, old.text);
  INSERT INTO articles_fts(rowid, regulation, article_number, title, text)
  VALUES (new.rowid, new.regulation, new.article_number, new.title, new.text);
END;

-- Definitions
CREATE TABLE IF NOT EXISTS definitions (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  article TEXT NOT NULL,
  UNIQUE(regulation, term)
);

-- Control mappings
CREATE TABLE IF NOT EXISTS control_mappings (
  id INTEGER PRIMARY KEY,
  framework TEXT NOT NULL DEFAULT 'ISO27001',
  control_id TEXT NOT NULL,
  control_name TEXT NOT NULL,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  articles TEXT NOT NULL,
  coverage TEXT CHECK(coverage IN ('full', 'partial', 'related')),
  notes TEXT
);

-- Applicability rules
CREATE TABLE IF NOT EXISTS applicability_rules (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  sector TEXT NOT NULL,
  subsector TEXT,
  applies INTEGER NOT NULL,
  confidence TEXT CHECK(confidence IN ('definite', 'likely', 'possible')),
  basis_article TEXT,
  notes TEXT
);

-- Source registry for tracking data quality
CREATE TABLE IF NOT EXISTS source_registry (
  regulation TEXT PRIMARY KEY REFERENCES regulations(id),
  celex_id TEXT NOT NULL,
  eur_lex_version TEXT,
  last_fetched TEXT,
  articles_expected INTEGER,
  articles_parsed INTEGER,
  quality_status TEXT CHECK(quality_status IN ('complete', 'review', 'incomplete')),
  notes TEXT
);

-- Recitals table
CREATE TABLE IF NOT EXISTS recitals (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  recital_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  related_articles TEXT,
  UNIQUE(regulation, recital_number)
);

-- FTS5 virtual table for recital search
CREATE VIRTUAL TABLE IF NOT EXISTS recitals_fts USING fts5(
  regulation,
  recital_number,
  text,
  content='recitals',
  content_rowid='id'
);

-- FTS5 triggers for recitals
CREATE TRIGGER IF NOT EXISTS recitals_ai AFTER INSERT ON recitals BEGIN
  INSERT INTO recitals_fts(rowid, regulation, recital_number, text)
  VALUES (new.id, new.regulation, new.recital_number, new.text);
END;

CREATE TRIGGER IF NOT EXISTS recitals_ad AFTER DELETE ON recitals BEGIN
  INSERT INTO recitals_fts(recitals_fts, rowid, regulation, recital_number, text)
  VALUES('delete', old.id, old.regulation, old.recital_number, old.text);
END;

CREATE TRIGGER IF NOT EXISTS recitals_au AFTER UPDATE ON recitals BEGIN
  INSERT INTO recitals_fts(recitals_fts, rowid, regulation, recital_number, text)
  VALUES('delete', old.id, old.regulation, old.recital_number, old.text);
  INSERT INTO recitals_fts(rowid, regulation, recital_number, text)
  VALUES (new.id, new.regulation, new.recital_number, new.text);
END;

-- Evidence requirements table
CREATE TABLE IF NOT EXISTS evidence_requirements (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  article TEXT NOT NULL,
  requirement_summary TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('document', 'log', 'test_result', 'certification', 'policy', 'procedure')),
  artifact_name TEXT NOT NULL,
  artifact_example TEXT,
  description TEXT,
  retention_period TEXT,
  auditor_questions TEXT,
  maturity_levels TEXT,
  cross_references TEXT
);
`;

interface RegulationSeed {
  id: string;
  full_name: string;
  celex_id: string;
  effective_date?: string;
  eur_lex_url?: string;
  articles: Array<{
    number: string;
    title?: string;
    text: string;
    chapter?: string;
    recitals?: string[];
    cross_references?: string[];
  }>;
  definitions?: Array<{
    term: string;
    definition: string;
    article: string;
  }>;
  recitals?: Array<{
    recital_number: number;
    text: string;
    related_articles?: string;
  }>;
}

function buildDatabase() {
  console.log('Building regulations database...');

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // Delete existing database
  if (existsSync(DB_PATH)) {
    console.log('Removing existing database...');
    unlinkSync(DB_PATH);
  }

  // Create new database
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  // Create schema
  console.log('Creating schema...');
  db.exec(SCHEMA);

  // Load and insert seed files
  if (existsSync(SEED_DIR)) {
    const seedFiles = readdirSync(SEED_DIR).filter((f: string) => f.endsWith('.json'));

    for (const file of seedFiles) {
      if (file.startsWith('mappings')) continue;

      console.log(`Loading ${file}...`);
      const content = readFileSync(join(SEED_DIR, file), 'utf-8');
      const regulation: RegulationSeed = JSON.parse(content);

      // Insert regulation
      db.prepare(`
        INSERT INTO regulations (id, full_name, celex_id, effective_date, eur_lex_url)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        regulation.id,
        regulation.full_name,
        regulation.celex_id,
        regulation.effective_date || null,
        regulation.eur_lex_url || null
      );

      // Insert articles
      const insertArticle = db.prepare(`
        INSERT INTO articles (regulation, article_number, title, text, chapter, recitals, cross_references)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const article of regulation.articles) {
        insertArticle.run(
          regulation.id,
          article.number,
          article.title || null,
          article.text,
          article.chapter || null,
          article.recitals ? JSON.stringify(article.recitals) : null,
          article.cross_references ? JSON.stringify(article.cross_references) : null
        );
      }

      // Insert definitions
      if (regulation.definitions) {
        const insertDefinition = db.prepare(`
          INSERT OR IGNORE INTO definitions (regulation, term, definition, article)
          VALUES (?, ?, ?, ?)
        `);

        for (const def of regulation.definitions) {
          insertDefinition.run(regulation.id, def.term, def.definition, def.article);
        }
      }

      // Insert recitals
      if (regulation.recitals) {
        const insertRecital = db.prepare(`
          INSERT OR IGNORE INTO recitals (regulation, recital_number, text, related_articles)
          VALUES (?, ?, ?, ?)
        `);

        for (const recital of regulation.recitals) {
          insertRecital.run(
            regulation.id,
            recital.recital_number,
            recital.text,
            recital.related_articles ? JSON.stringify(recital.related_articles) : null
          );
        }
      }

      // Update source registry with timestamps
      const now = new Date().toISOString();
      const eurLexVersion = regulation.effective_date || now.split('T')[0];
      db.prepare(`
        INSERT INTO source_registry (regulation, celex_id, eur_lex_version, last_fetched, articles_expected, articles_parsed, quality_status)
        VALUES (?, ?, ?, ?, ?, ?, 'complete')
      `).run(regulation.id, regulation.celex_id, eurLexVersion, now, regulation.articles.length, regulation.articles.length);

      console.log(`  Loaded ${regulation.articles.length} articles, ${regulation.definitions?.length || 0} definitions`);
      if (regulation.recitals && regulation.recitals.length > 0) {
        console.log(`  Loaded ${regulation.recitals.length} recitals`);
      }
    }

    // Load mappings
    const mappingsDir = join(SEED_DIR, 'mappings');
    if (existsSync(mappingsDir)) {
      const mappingFiles = readdirSync(mappingsDir).filter((f: string) => f.endsWith('.json'));

      for (const file of mappingFiles) {
        console.log(`Loading mappings from ${file}...`);
        const content = readFileSync(join(mappingsDir, file), 'utf-8');
        const mappings = JSON.parse(content);

        // Detect framework from filename
        let framework = 'ISO27001';
        if (file.startsWith('nist-csf-')) {
          framework = 'NIST_CSF';
        } else if (file.startsWith('iso27001-')) {
          framework = 'ISO27001';
        }

        const insertMapping = db.prepare(`
          INSERT INTO control_mappings (framework, control_id, control_name, regulation, articles, coverage, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const mapping of mappings) {
          insertMapping.run(
            framework,
            mapping.control_id,
            mapping.control_name,
            mapping.regulation,
            JSON.stringify(mapping.articles),
            mapping.coverage,
            mapping.notes || null
          );
        }

        console.log(`  Loaded ${mappings.length} ${framework} control mappings`);
      }
    }

    // Load applicability rules
    const applicabilityDir = join(SEED_DIR, 'applicability');
    if (existsSync(applicabilityDir)) {
      const applicabilityFiles = readdirSync(applicabilityDir).filter((f: string) => f.endsWith('.json'));

      const insertApplicability = db.prepare(`
        INSERT INTO applicability_rules (regulation, sector, subsector, applies, confidence, basis_article, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const file of applicabilityFiles) {
        console.log(`Loading applicability rules from ${file}...`);
        const content = readFileSync(join(applicabilityDir, file), 'utf-8');
        const rules = JSON.parse(content);

        for (const rule of rules) {
          insertApplicability.run(
            rule.regulation,
            rule.sector,
            rule.subsector || null,
            rule.applies ? 1 : 0,
            rule.confidence,
            rule.basis_article || null,
            rule.notes || null
          );
        }

        console.log(`  Loaded ${rules.length} applicability rules`);
      }
    }

    // Load evidence requirements
    const evidenceDir = join(SEED_DIR, 'evidence');
    if (existsSync(evidenceDir)) {
      const evidenceFiles = readdirSync(evidenceDir).filter((f: string) => f.endsWith('.json'));

      const insertEvidence = db.prepare(`
        INSERT INTO evidence_requirements (
          regulation, article, requirement_summary, evidence_type,
          artifact_name, artifact_example, description, retention_period,
          auditor_questions, maturity_levels, cross_references
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const file of evidenceFiles) {
        console.log(`Loading evidence requirements from ${file}...`);
        const content = readFileSync(join(evidenceDir, file), 'utf-8');
        const requirements = JSON.parse(content);

        for (const req of requirements) {
          insertEvidence.run(
            req.regulation,
            req.article,
            req.requirement_summary,
            req.evidence_type,
            req.artifact_name,
            req.artifact_example || null,
            req.description || null,
            req.retention_period || null,
            req.auditor_questions ? JSON.stringify(req.auditor_questions) : null,
            req.maturity_levels ? JSON.stringify(req.maturity_levels) : null,
            req.cross_references ? JSON.stringify(req.cross_references) : null
          );
        }

        console.log(`  Loaded ${requirements.length} evidence requirements`);
      }
    }
  } else {
    console.log('No seed directory found. Database created with empty tables.');
    console.log(`Create seed files in: ${SEED_DIR}`);
  }

  db.close();
  console.log(`\nDatabase created at: ${DB_PATH}`);
}

buildDatabase();
