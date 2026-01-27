#!/usr/bin/env npx tsx

/**
 * Migrate SQLite database to PostgreSQL
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/migrate-postgres.ts
 *
 * Options:
 *   --drop    Drop existing tables before creating (DESTRUCTIVE)
 *   --verify  Verify migration without making changes
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SQLITE_PATH = join(__dirname, '../data/regulations.db');

// Parse command line args
const args = process.argv.slice(2);
const DROP_TABLES = args.includes('--drop');
const VERIFY_ONLY = args.includes('--verify');

interface MigrationStats {
  regulations: number;
  articles: number;
  recitals: number;
  definitions: number;
  control_mappings: number;
  applicability_rules: number;
  source_registry: number;
}

async function main() {
  console.log('🚀 PostgreSQL Migration Tool\n');

  // Get connection string
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log(`📊 SQLite Source: ${SQLITE_PATH}`);
  console.log(`🐘 PostgreSQL Target: ${connectionString.replace(/:[^:@]+@/, ':***@')}\n`);

  if (VERIFY_ONLY) {
    console.log('🔍 Verification mode - no changes will be made\n');
  }

  if (DROP_TABLES) {
    console.log('⚠️  DROP MODE - All existing data will be deleted!\n');
  }

  // Connect to databases
  console.log('Connecting to databases...');
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pgPool = new pg.Pool({ connectionString });

  try {
    // Test PostgreSQL connection
    await pgPool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL\n');

    if (VERIFY_ONLY) {
      await verifyMigration(sqlite, pgPool);
    } else {
      await migrate(sqlite, pgPool, DROP_TABLES);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    sqlite.close();
    await pgPool.end();
  }
}

async function migrate(sqlite: Database.Database, pgPool: pg.Pool, dropTables: boolean) {
  console.log('='.repeat(60));
  console.log('STARTING MIGRATION');
  console.log('='.repeat(60));
  console.log();

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // Step 1: Drop tables if requested
    if (dropTables) {
      console.log('🗑️  Dropping existing tables...');
      await dropAllTables(client);
      console.log('✅ Tables dropped\n');
    }

    // Step 2: Create schema
    console.log('📐 Creating PostgreSQL schema...');
    await createSchema(client);
    console.log('✅ Schema created\n');

    // Step 3: Copy data
    console.log('📦 Copying data from SQLite...');
    const stats = await copyData(sqlite, client);
    console.log('✅ Data copied\n');

    // Step 4: Create indexes
    console.log('🔍 Creating indexes...');
    await createIndexes(client);
    console.log('✅ Indexes created\n');

    // Step 5: Create FTS
    console.log('🔎 Creating full-text search indexes...');
    await createFullTextSearch(client);
    console.log('✅ Full-text search ready\n');

    await client.query('COMMIT');

    // Step 6: Print summary
    console.log('='.repeat(60));
    console.log('MIGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log('\nMigrated records:');
    console.log(`  Regulations:        ${stats.regulations}`);
    console.log(`  Articles:           ${stats.articles}`);
    console.log(`  Recitals:           ${stats.recitals}`);
    console.log(`  Definitions:        ${stats.definitions}`);
    console.log(`  Control Mappings:   ${stats.control_mappings}`);
    console.log(`  Applicability Rules:${stats.applicability_rules}`);
    console.log(`  Source Registry:    ${stats.source_registry}`);
    console.log(`\n✅ Total:             ${Object.values(stats).reduce((a, b) => a + b, 0)} records\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function dropAllTables(client: pg.PoolClient) {
  const tables = [
    'applicability_rules',
    'control_mappings',
    'definitions',
    'recitals',
    'articles',
    'source_registry',
    'regulations'
  ];

  for (const table of tables) {
    await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

async function createSchema(client: pg.PoolClient) {
  // Regulations table
  await client.query(`
    CREATE TABLE IF NOT EXISTS regulations (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      celex_id TEXT NOT NULL,
      effective_date TEXT,
      last_amended TEXT,
      eur_lex_url TEXT
    )
  `);

  // Source registry table
  await client.query(`
    CREATE TABLE IF NOT EXISTS source_registry (
      regulation TEXT PRIMARY KEY REFERENCES regulations(id),
      celex_id TEXT NOT NULL,
      eur_lex_version TEXT,
      last_fetched TEXT,
      articles_expected INTEGER,
      articles_parsed INTEGER,
      quality_status TEXT CHECK(quality_status IN ('complete', 'review', 'incomplete')),
      notes TEXT
    )
  `);

  // Articles table
  await client.query(`
    CREATE TABLE IF NOT EXISTS articles (
      id SERIAL PRIMARY KEY,
      regulation TEXT NOT NULL REFERENCES regulations(id),
      article_number TEXT NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      chapter TEXT,
      recitals TEXT,
      cross_references TEXT,
      search_vector tsvector,
      UNIQUE(regulation, article_number)
    )
  `);

  // Recitals table
  await client.query(`
    CREATE TABLE IF NOT EXISTS recitals (
      id SERIAL PRIMARY KEY,
      regulation TEXT NOT NULL REFERENCES regulations(id),
      recital_number INTEGER NOT NULL,
      text TEXT NOT NULL,
      related_articles TEXT,
      search_vector tsvector,
      UNIQUE(regulation, recital_number)
    )
  `);

  // Definitions table
  await client.query(`
    CREATE TABLE IF NOT EXISTS definitions (
      id SERIAL PRIMARY KEY,
      regulation TEXT NOT NULL REFERENCES regulations(id),
      term TEXT NOT NULL,
      definition TEXT NOT NULL,
      article TEXT NOT NULL,
      UNIQUE(regulation, term)
    )
  `);

  // Control mappings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS control_mappings (
      id SERIAL PRIMARY KEY,
      framework TEXT NOT NULL DEFAULT 'ISO27001',
      control_id TEXT NOT NULL,
      control_name TEXT NOT NULL,
      regulation TEXT NOT NULL REFERENCES regulations(id),
      articles TEXT NOT NULL,
      coverage TEXT CHECK(coverage IN ('full', 'partial', 'related')),
      notes TEXT
    )
  `);

  // Applicability rules table
  await client.query(`
    CREATE TABLE IF NOT EXISTS applicability_rules (
      id SERIAL PRIMARY KEY,
      regulation TEXT NOT NULL REFERENCES regulations(id),
      sector TEXT NOT NULL,
      subsector TEXT,
      applies INTEGER NOT NULL,
      confidence TEXT CHECK(confidence IN ('definite', 'likely', 'possible')),
      basis_article TEXT,
      notes TEXT
    )
  `);
}

async function copyData(sqlite: Database.Database, client: pg.PoolClient): Promise<MigrationStats> {
  const stats: MigrationStats = {
    regulations: 0,
    articles: 0,
    recitals: 0,
    definitions: 0,
    control_mappings: 0,
    applicability_rules: 0,
    source_registry: 0
  };

  // Copy regulations
  const regulations = sqlite.prepare('SELECT * FROM regulations').all();
  for (const reg of regulations) {
    await client.query(
      'INSERT INTO regulations (id, full_name, celex_id, effective_date, last_amended, eur_lex_url) VALUES ($1, $2, $3, $4, $5, $6)',
      [reg.id, reg.full_name, reg.celex_id, reg.effective_date, reg.last_amended, reg.eur_lex_url]
    );
    stats.regulations++;
  }
  console.log(`  ✓ Copied ${stats.regulations} regulations`);

  // Copy source registry
  const sourceRegistry = sqlite.prepare('SELECT * FROM source_registry').all();
  for (const sr of sourceRegistry) {
    await client.query(
      'INSERT INTO source_registry (regulation, celex_id, eur_lex_version, last_fetched, articles_expected, articles_parsed, quality_status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [sr.regulation, sr.celex_id, sr.eur_lex_version, sr.last_fetched, sr.articles_expected, sr.articles_parsed, sr.quality_status, sr.notes]
    );
    stats.source_registry++;
  }
  console.log(`  ✓ Copied ${stats.source_registry} source registry entries`);

  // Copy articles
  const articles = sqlite.prepare('SELECT * FROM articles').all();
  for (const art of articles) {
    await client.query(
      'INSERT INTO articles (regulation, article_number, title, text, chapter, recitals, cross_references) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [art.regulation, art.article_number, art.title, art.text, art.chapter, art.recitals, art.cross_references]
    );
    stats.articles++;
  }
  console.log(`  ✓ Copied ${stats.articles} articles`);

  // Copy recitals
  const recitals = sqlite.prepare('SELECT * FROM recitals').all();
  for (const rec of recitals) {
    await client.query(
      'INSERT INTO recitals (regulation, recital_number, text, related_articles) VALUES ($1, $2, $3, $4)',
      [rec.regulation, rec.recital_number, rec.text, rec.related_articles]
    );
    stats.recitals++;
  }
  console.log(`  ✓ Copied ${stats.recitals} recitals`);

  // Copy definitions
  const definitions = sqlite.prepare('SELECT * FROM definitions').all();
  for (const def of definitions) {
    await client.query(
      'INSERT INTO definitions (regulation, term, definition, article) VALUES ($1, $2, $3, $4)',
      [def.regulation, def.term, def.definition, def.article]
    );
    stats.definitions++;
  }
  console.log(`  ✓ Copied ${stats.definitions} definitions`);

  // Copy control mappings
  const mappings = sqlite.prepare('SELECT * FROM control_mappings').all();
  for (const map of mappings) {
    await client.query(
      'INSERT INTO control_mappings (framework, control_id, control_name, regulation, articles, coverage, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [map.framework, map.control_id, map.control_name, map.regulation, map.articles, map.coverage, map.notes]
    );
    stats.control_mappings++;
  }
  console.log(`  ✓ Copied ${stats.control_mappings} control mappings`);

  // Copy applicability rules
  const rules = sqlite.prepare('SELECT * FROM applicability_rules').all();
  for (const rule of rules) {
    await client.query(
      'INSERT INTO applicability_rules (regulation, sector, subsector, applies, confidence, basis_article, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [rule.regulation, rule.sector, rule.subsector, rule.applies, rule.confidence, rule.basis_article, rule.notes]
    );
    stats.applicability_rules++;
  }
  console.log(`  ✓ Copied ${stats.applicability_rules} applicability rules`);

  return stats;
}

async function createIndexes(client: pg.PoolClient) {
  await client.query('CREATE INDEX IF NOT EXISTS idx_articles_regulation ON articles(regulation)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_recitals_regulation ON recitals(regulation)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_definitions_regulation ON definitions(regulation)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_definitions_term ON definitions(term)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_control_mappings_framework ON control_mappings(framework, regulation)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_applicability_sector ON applicability_rules(sector, regulation)');
}

async function createFullTextSearch(client: pg.PoolClient) {
  // Update search_vector for articles
  await client.query(`
    UPDATE articles
    SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || text)
  `);

  // Create GIN index for articles
  await client.query('CREATE INDEX IF NOT EXISTS idx_articles_search ON articles USING gin(search_vector)');

  // Update search_vector for recitals
  await client.query(`
    UPDATE recitals
    SET search_vector = to_tsvector('english', text)
  `);

  // Create GIN index for recitals
  await client.query('CREATE INDEX IF NOT EXISTS idx_recitals_search ON recitals USING gin(search_vector)');
}

async function verifyMigration(sqlite: Database.Database, pgPool: pg.Pool) {
  console.log('Verifying migration...\n');

  const sqliteCounts = {
    regulations: sqlite.prepare('SELECT COUNT(*) as count FROM regulations').get().count,
    articles: sqlite.prepare('SELECT COUNT(*) as count FROM articles').get().count,
    recitals: sqlite.prepare('SELECT COUNT(*) as count FROM recitals').get().count,
    definitions: sqlite.prepare('SELECT COUNT(*) as count FROM definitions').get().count,
    control_mappings: sqlite.prepare('SELECT COUNT(*) as count FROM control_mappings').get().count,
    applicability_rules: sqlite.prepare('SELECT COUNT(*) as count FROM applicability_rules').get().count
  };

  const pgCounts = {
    regulations: (await pgPool.query('SELECT COUNT(*) as count FROM regulations')).rows[0].count,
    articles: (await pgPool.query('SELECT COUNT(*) as count FROM articles')).rows[0].count,
    recitals: (await pgPool.query('SELECT COUNT(*) as count FROM recitals')).rows[0].count,
    definitions: (await pgPool.query('SELECT COUNT(*) as count FROM definitions')).rows[0].count,
    control_mappings: (await pgPool.query('SELECT COUNT(*) as count FROM control_mappings')).rows[0].count,
    applicability_rules: (await pgPool.query('SELECT COUNT(*) as count FROM applicability_rules')).rows[0].count
  };

  console.log('Record counts:');
  console.log('Table                 | SQLite | PostgreSQL | Status');
  console.log('----------------------|--------|------------|-------');

  let allMatch = true;
  for (const table of Object.keys(sqliteCounts)) {
    const sqliteCount = sqliteCounts[table];
    const pgCount = parseInt(pgCounts[table]);
    const match = sqliteCount === pgCount;
    allMatch = allMatch && match;
    const status = match ? '✅' : '❌';
    console.log(`${table.padEnd(21)} | ${String(sqliteCount).padStart(6)} | ${String(pgCount).padStart(10)} | ${status}`);
  }

  console.log();
  if (allMatch) {
    console.log('✅ All tables match!\n');
  } else {
    console.log('❌ Some tables do not match\n');
    process.exit(1);
  }

  // Test FTS
  console.log('Testing full-text search...');
  const ftsResult = await pgPool.query(`
    SELECT regulation, article_number, title
    FROM articles
    WHERE search_vector @@ to_tsquery('english', 'incident')
    LIMIT 3
  `);

  if (ftsResult.rows.length > 0) {
    console.log(`✅ FTS working (found ${ftsResult.rows.length} results for "incident")\n`);
    ftsResult.rows.forEach(row => {
      console.log(`  ${row.regulation} Article ${row.article_number}: ${row.title}`);
    });
    console.log();
  } else {
    console.log('❌ FTS not working\n');
    process.exit(1);
  }

  console.log('✅ Verification complete\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
