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
          INSERT INTO definitions (regulation, term, definition, article)
          VALUES (?, ?, ?, ?)
        `);

        for (const def of regulation.definitions) {
          insertDefinition.run(regulation.id, def.term, def.definition, def.article);
        }
      }

      // Update source registry
      db.prepare(`
        INSERT INTO source_registry (regulation, celex_id, articles_expected, articles_parsed, quality_status)
        VALUES (?, ?, ?, ?, 'complete')
      `).run(regulation.id, regulation.celex_id, regulation.articles.length, regulation.articles.length);

      console.log(`  Loaded ${regulation.articles.length} articles, ${regulation.definitions?.length || 0} definitions`);
    }

    // Load mappings
    const mappingsDir = join(SEED_DIR, 'mappings');
    if (existsSync(mappingsDir)) {
      const mappingFiles = readdirSync(mappingsDir).filter((f: string) => f.endsWith('.json'));

      for (const file of mappingFiles) {
        console.log(`Loading mappings from ${file}...`);
        const content = readFileSync(join(mappingsDir, file), 'utf-8');
        const mappings = JSON.parse(content);

        const insertMapping = db.prepare(`
          INSERT INTO control_mappings (control_id, control_name, regulation, articles, coverage, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const mapping of mappings) {
          insertMapping.run(
            mapping.control_id,
            mapping.control_name,
            mapping.regulation,
            JSON.stringify(mapping.articles),
            mapping.coverage,
            mapping.notes || null
          );
        }

        console.log(`  Loaded ${mappings.length} control mappings`);
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
