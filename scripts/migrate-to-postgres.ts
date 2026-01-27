#!/usr/bin/env npx tsx

/**
 * Migrate regulations.db from SQLite to PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@localhost:5432/eu_regs npm run migrate:postgres
 *
 * This script:
 * 1. Creates PostgreSQL schema
 * 2. Reads from SQLite (data/regulations.db)
 * 3. Writes to PostgreSQL using transactions
 * 4. Verifies row counts match
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SQLITE_DB_PATH = join(__dirname, '..', 'data', 'regulations.db');
const PG_CONNECTION = process.env.DATABASE_URL;

if (!PG_CONNECTION) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('Example: DATABASE_URL=postgresql://user:pass@localhost:5432/eu_regs');
  process.exit(1);
}

const POSTGRES_SCHEMA = `
-- Core regulation metadata
CREATE TABLE IF NOT EXISTS regulations (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  celex_id TEXT NOT NULL,
  effective_date DATE,
  last_amended DATE,
  eur_lex_url TEXT
);

-- Articles table
CREATE TABLE IF NOT EXISTS articles (
  id SERIAL PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  article_number TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  chapter TEXT,
  recitals TEXT,
  cross_references TEXT,
  UNIQUE(regulation, article_number)
);

-- Full-text search indexes (PostgreSQL native)
CREATE INDEX IF NOT EXISTS articles_fts_idx ON articles
  USING GIN (to_tsvector('english', COALESCE(title, '') || ' ' || text));

CREATE INDEX IF NOT EXISTS articles_regulation_idx ON articles(regulation);

-- Definitions
CREATE TABLE IF NOT EXISTS definitions (
  id SERIAL PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  article TEXT NOT NULL,
  UNIQUE(regulation, term)
);

CREATE INDEX IF NOT EXISTS definitions_term_idx ON definitions(term);

-- Control mappings
CREATE TABLE IF NOT EXISTS control_mappings (
  id SERIAL PRIMARY KEY,
  framework TEXT NOT NULL DEFAULT 'ISO27001',
  control_id TEXT NOT NULL,
  control_name TEXT NOT NULL,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  articles TEXT NOT NULL,
  coverage TEXT CHECK(coverage IN ('full', 'partial', 'related')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS control_mappings_framework_idx ON control_mappings(framework, control_id);

-- Applicability rules
CREATE TABLE IF NOT EXISTS applicability_rules (
  id SERIAL PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  sector TEXT NOT NULL,
  subsector TEXT,
  applies BOOLEAN NOT NULL,
  confidence TEXT CHECK(confidence IN ('definite', 'likely', 'possible')),
  basis_article TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS applicability_sector_idx ON applicability_rules(sector);

-- Source registry for tracking data quality
CREATE TABLE IF NOT EXISTS source_registry (
  regulation TEXT PRIMARY KEY REFERENCES regulations(id),
  celex_id TEXT NOT NULL,
  eur_lex_version TEXT,
  last_fetched TIMESTAMPTZ,
  articles_expected INTEGER,
  articles_parsed INTEGER,
  quality_status TEXT CHECK(quality_status IN ('complete', 'review', 'incomplete')),
  notes TEXT
);

-- Recitals table
CREATE TABLE IF NOT EXISTS recitals (
  id SERIAL PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  recital_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  related_articles TEXT,
  UNIQUE(regulation, recital_number)
);

-- Full-text search for recitals
CREATE INDEX IF NOT EXISTS recitals_fts_idx ON recitals
  USING GIN (to_tsvector('english', text));

CREATE INDEX IF NOT EXISTS recitals_regulation_idx ON recitals(regulation);
`;

interface MigrationStats {
  tableName: string;
  sqliteCount: number;
  postgresCount: number;
  status: 'ok' | 'mismatch';
}

async function migrate() {
  console.log('🚀 Starting SQLite → PostgreSQL migration\n');

  // Open SQLite database (read-only)
  console.log(`📂 Opening SQLite database: ${SQLITE_DB_PATH}`);
  const sqlite = new Database(SQLITE_DB_PATH, { readonly: true });

  // Connect to PostgreSQL
  console.log(`🔌 Connecting to PostgreSQL: ${PG_CONNECTION.replace(/\/\/.*@/, '//***@')}`);
  const pgPool = new pg.Pool({ connectionString: PG_CONNECTION });
  const pgClient = await pgPool.connect();

  try {
    // Create PostgreSQL schema
    console.log('\n📝 Creating PostgreSQL schema...');
    await pgClient.query(POSTGRES_SCHEMA);
    console.log('✅ Schema created');

    // Start transaction
    await pgClient.query('BEGIN');

    const stats: MigrationStats[] = [];

    // Migrate regulations
    console.log('\n📋 Migrating regulations...');
    const regulations = sqlite.prepare('SELECT * FROM regulations').all();
    for (const reg of regulations) {
      await pgClient.query(
        `INSERT INTO regulations (id, full_name, celex_id, effective_date, last_amended, eur_lex_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [reg.id, reg.full_name, reg.celex_id, reg.effective_date, reg.last_amended, reg.eur_lex_url]
      );
    }
    const pgRegCount = await pgClient.query('SELECT COUNT(*) FROM regulations');
    stats.push({
      tableName: 'regulations',
      sqliteCount: regulations.length,
      postgresCount: parseInt(pgRegCount.rows[0].count),
      status: regulations.length === parseInt(pgRegCount.rows[0].count) ? 'ok' : 'mismatch'
    });
    console.log(`   SQLite: ${regulations.length} rows`);
    console.log(`   Postgres: ${pgRegCount.rows[0].count} rows`);

    // Migrate articles
    console.log('\n📄 Migrating articles...');
    const articles = sqlite.prepare('SELECT * FROM articles').all();
    for (const article of articles) {
      await pgClient.query(
        `INSERT INTO articles (regulation, article_number, title, text, chapter, recitals, cross_references)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (regulation, article_number) DO NOTHING`,
        [article.regulation, article.article_number, article.title, article.text,
         article.chapter, article.recitals, article.cross_references]
      );
    }
    const pgArticleCount = await pgClient.query('SELECT COUNT(*) FROM articles');
    stats.push({
      tableName: 'articles',
      sqliteCount: articles.length,
      postgresCount: parseInt(pgArticleCount.rows[0].count),
      status: articles.length === parseInt(pgArticleCount.rows[0].count) ? 'ok' : 'mismatch'
    });
    console.log(`   SQLite: ${articles.length} rows`);
    console.log(`   Postgres: ${pgArticleCount.rows[0].count} rows`);

    // Migrate recitals
    console.log('\n📜 Migrating recitals...');
    const recitals = sqlite.prepare('SELECT * FROM recitals').all();
    for (const recital of recitals) {
      await pgClient.query(
        `INSERT INTO recitals (regulation, recital_number, text, related_articles)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (regulation, recital_number) DO NOTHING`,
        [recital.regulation, recital.recital_number, recital.text, recital.related_articles]
      );
    }
    const pgRecitalCount = await pgClient.query('SELECT COUNT(*) FROM recitals');
    stats.push({
      tableName: 'recitals',
      sqliteCount: recitals.length,
      postgresCount: parseInt(pgRecitalCount.rows[0].count),
      status: recitals.length === parseInt(pgRecitalCount.rows[0].count) ? 'ok' : 'mismatch'
    });
    console.log(`   SQLite: ${recitals.length} rows`);
    console.log(`   Postgres: ${pgRecitalCount.rows[0].count} rows`);

    // Migrate definitions
    console.log('\n📚 Migrating definitions...');
    const definitions = sqlite.prepare('SELECT * FROM definitions').all();
    for (const def of definitions) {
      await pgClient.query(
        `INSERT INTO definitions (regulation, term, definition, article)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (regulation, term) DO NOTHING`,
        [def.regulation, def.term, def.definition, def.article]
      );
    }
    const pgDefCount = await pgClient.query('SELECT COUNT(*) FROM definitions');
    stats.push({
      tableName: 'definitions',
      sqliteCount: definitions.length,
      postgresCount: parseInt(pgDefCount.rows[0].count),
      status: definitions.length === parseInt(pgDefCount.rows[0].count) ? 'ok' : 'mismatch'
    });
    console.log(`   SQLite: ${definitions.length} rows`);
    console.log(`   Postgres: ${pgDefCount.rows[0].count} rows`);

    // Migrate control mappings
    console.log('\n🛡️  Migrating control mappings...');
    const mappings = sqlite.prepare('SELECT * FROM control_mappings').all();
    for (const mapping of mappings) {
      await pgClient.query(
        `INSERT INTO control_mappings (framework, control_id, control_name, regulation, articles, coverage, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [mapping.framework, mapping.control_id, mapping.control_name, mapping.regulation,
         mapping.articles, mapping.coverage, mapping.notes]
      );
    }
    const pgMappingCount = await pgClient.query('SELECT COUNT(*) FROM control_mappings');
    stats.push({
      tableName: 'control_mappings',
      sqliteCount: mappings.length,
      postgresCount: parseInt(pgMappingCount.rows[0].count),
      status: mappings.length === parseInt(pgMappingCount.rows[0].count) ? 'ok' : 'mismatch'
    });
    console.log(`   SQLite: ${mappings.length} rows`);
    console.log(`   Postgres: ${pgMappingCount.rows[0].count} rows`);

    // Migrate applicability rules
    console.log('\n✅ Migrating applicability rules...');
    const rules = sqlite.prepare('SELECT * FROM applicability_rules').all();
    for (const rule of rules) {
      await pgClient.query(
        `INSERT INTO applicability_rules (regulation, sector, subsector, applies, confidence, basis_article, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [rule.regulation, rule.sector, rule.subsector, rule.applies === 1,
         rule.confidence, rule.basis_article, rule.notes]
      );
    }
    const pgRuleCount = await pgClient.query('SELECT COUNT(*) FROM applicability_rules');
    stats.push({
      tableName: 'applicability_rules',
      sqliteCount: rules.length,
      postgresCount: parseInt(pgRuleCount.rows[0].count),
      status: rules.length === parseInt(pgRuleCount.rows[0].count) ? 'ok' : 'mismatch'
    });
    console.log(`   SQLite: ${rules.length} rows`);
    console.log(`   Postgres: ${pgRuleCount.rows[0].count} rows`);

    // Migrate source registry
    console.log('\n📊 Migrating source registry...');
    const registry = sqlite.prepare('SELECT * FROM source_registry').all();
    for (const entry of registry) {
      await pgClient.query(
        `INSERT INTO source_registry (regulation, celex_id, eur_lex_version, last_fetched, articles_expected, articles_parsed, quality_status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (regulation) DO NOTHING`,
        [entry.regulation, entry.celex_id, entry.eur_lex_version, entry.last_fetched,
         entry.articles_expected, entry.articles_parsed, entry.quality_status, entry.notes]
      );
    }
    const pgRegisCount = await pgClient.query('SELECT COUNT(*) FROM source_registry');
    stats.push({
      tableName: 'source_registry',
      sqliteCount: registry.length,
      postgresCount: parseInt(pgRegisCount.rows[0].count),
      status: registry.length === parseInt(pgRegisCount.rows[0].count) ? 'ok' : 'mismatch'
    });
    console.log(`   SQLite: ${registry.length} rows`);
    console.log(`   Postgres: ${pgRegisCount.rows[0].count} rows`);

    // Commit transaction
    await pgClient.query('COMMIT');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));

    let allOk = true;
    for (const stat of stats) {
      const emoji = stat.status === 'ok' ? '✅' : '❌';
      console.log(`${emoji} ${stat.tableName.padEnd(20)} | SQLite: ${String(stat.sqliteCount).padStart(5)} | Postgres: ${String(stat.postgresCount).padStart(5)}`);
      if (stat.status === 'mismatch') allOk = false;
    }

    console.log('='.repeat(60));

    if (allOk) {
      console.log('\n✅ Migration completed successfully!');
      console.log('\n💡 Next steps:');
      console.log('   1. Update DATABASE_URL in your .env file');
      console.log('   2. Test queries with: npm run dev:api');
      console.log('   3. Keep SQLite database as backup');
    } else {
      console.log('\n⚠️  Migration completed with mismatches. Please review.');
      process.exit(1);
    }

  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    sqlite.close();
    pgClient.release();
    await pgPool.end();
  }
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
