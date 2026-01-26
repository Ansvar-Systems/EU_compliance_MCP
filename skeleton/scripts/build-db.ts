#!/usr/bin/env tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATABASE BUILDER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Builds the SQLite database from seed JSON files.
 *
 * This script is run during development and before releases to create
 * the pre-built database that ships with the package.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * USAGE
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   npm run build:db
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WORKFLOW
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   1. Delete existing database (if any)
 *   2. Create new database with schema
 *   3. Load all seed JSON files from data/seed/
 *   4. Insert data with relationships
 *   5. Create FTS5 full-text search indexes
 *   6. Update source registry metadata
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CUSTOMIZATION
 * ───────────────────────────────────────────────────────────────────────────
 *
 * To adapt for your server:
 *
 *   1. Update SCHEMA to match your data model
 *   2. Update seed file interfaces (SourceSeed, ItemSeed, etc.)
 *   3. Update loading logic in buildDatabase()
 *   4. Add any additional tables or indexes you need
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SEED FILE FORMAT
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Each seed file should be a JSON file with this structure:
 *
 *   {
 *     "id": "SOURCE_ID",
 *     "full_name": "Full Name of Source",
 *     "identifier": "official-id-123",
 *     "effective_date": "2024-01-01",
 *     "source_url": "https://...",
 *     "items": [
 *       {
 *         "item_id": "1",
 *         "title": "Item Title",
 *         "text": "Full text content...",
 *         "parent": "Chapter I"
 *       }
 *     ],
 *     "definitions": [
 *       {
 *         "term": "defined term",
 *         "definition": "The official definition...",
 *         "defining_item": "4"
 *       }
 *     ]
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @module scripts/build-db
 * @author Ansvar Systems AB
 * @license Apache-2.0
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Path resolution for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Directory containing seed JSON files */
const SEED_DIR = path.resolve(__dirname, '../data/seed');

/** Output database path */
const DB_PATH = path.resolve(__dirname, '../data/database.db');

/** Subdirectory for control mapping files */
const MAPPINGS_DIR = path.join(SEED_DIR, 'mappings');

/** Subdirectory for applicability rule files */
const APPLICABILITY_DIR = path.join(SEED_DIR, 'applicability');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES - Seed File Formats
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Seed file for a source (regulation, statute, standard)
 *
 * This is the expected format for files in data/seed/*.json
 */
interface SourceSeed {
  /** Unique identifier (e.g., "GDPR", "NIS2", "BrB") */
  id: string;

  /** Full official name */
  full_name: string;

  /** Official identifier (CELEX number, SFS number, etc.) */
  identifier?: string;

  /** Date when the source became effective (ISO 8601) */
  effective_date?: string;

  /** URL to official publication */
  source_url?: string;

  /** Items (articles, sections, clauses) */
  items: ItemSeed[];

  /** Defined terms */
  definitions?: DefinitionSeed[];
}

/**
 * Seed data for an item (article, section, clause)
 */
interface ItemSeed {
  /** Identifier within the source (e.g., "25", "4:9c") */
  item_id: string;

  /** Title of the item */
  title?: string;

  /** Full text content */
  text: string;

  /** Parent element (chapter, part, etc.) */
  parent?: string;

  /** Additional metadata as JSON object */
  metadata?: Record<string, unknown>;

  /** Related items as array of references */
  related?: Array<{
    type: string;
    source: string;
    item_id: string;
  }>;
}

/**
 * Seed data for a definition
 */
interface DefinitionSeed {
  /** The defined term */
  term: string;

  /** Official definition text */
  definition: string;

  /** Item that contains this definition (e.g., "4") */
  defining_item?: string;
}

/**
 * Seed file for control mappings (e.g., ISO 27001 → GDPR)
 *
 * Expected format for files in data/seed/mappings/*.json
 */
interface MappingSeed {
  /** Framework being mapped from (e.g., "ISO27001") */
  framework: string;

  /** Target source being mapped to (e.g., "GDPR") */
  target_source: string;

  /** Individual control mappings */
  mappings: Array<{
    control_id: string;
    control_name: string;
    target_items: string[];
    coverage: 'full' | 'partial' | 'related';
    notes?: string;
  }>;
}

/**
 * Seed file for applicability rules
 *
 * Expected format for files in data/seed/applicability/*.json
 */
interface ApplicabilitySeed {
  /** Source these rules apply to */
  source: string;

  /** Applicability rules by sector */
  rules: Array<{
    sector: string;
    subsector?: string;
    applies: boolean;
    confidence: 'definite' | 'likely' | 'possible';
    basis_item?: string;
    conditions?: Record<string, unknown>;
    notes?: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete database schema
 *
 * Customize this for your specific data model. The schema includes:
 *
 *   - sources: Top-level containers (regulations, statutes, etc.)
 *   - items: Individual items (articles, sections, clauses)
 *   - items_fts: Full-text search index for items
 *   - definitions: Defined terms
 *   - mappings: Cross-framework mappings
 *   - applicability_rules: Sector applicability
 *   - source_registry: Metadata for update tracking
 */
const SCHEMA = `
-- ═══════════════════════════════════════════════════════════════════════════
-- SOURCES TABLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Top-level containers for your data (regulations, statutes, standards)
--
-- Examples:
--   - EU Regulations: GDPR, NIS2, DORA, AI_ACT
--   - Swedish Laws: BrB (Brottsbalken), OSL, DSL
--   - Standards: ISO27001, NIST_CSF
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE sources (
  -- Unique identifier (short code)
  -- Examples: "GDPR", "NIS2", "BrB"
  id TEXT PRIMARY KEY,

  -- Full official name
  -- Example: "General Data Protection Regulation"
  full_name TEXT NOT NULL,

  -- Official identifier from source system
  -- Examples: CELEX "32016R0679", SFS "2018:218"
  identifier TEXT UNIQUE,

  -- Date when source became effective (ISO 8601)
  effective_date TEXT,

  -- Date of last amendment (ISO 8601)
  last_amended TEXT,

  -- URL to official publication
  source_url TEXT
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ITEMS TABLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Individual items within sources (articles, sections, clauses)
--
-- The rowid is used by FTS5 for content sync.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE items (
  -- SQLite rowid (auto-generated, used by FTS5)
  rowid INTEGER PRIMARY KEY,

  -- Reference to parent source
  source TEXT NOT NULL REFERENCES sources(id),

  -- Identifier within the source
  -- Examples: "25" (Article 25), "4:9c" (Chapter 4, Section 9c)
  item_id TEXT NOT NULL,

  -- Item title (may be null for untitled items)
  title TEXT,

  -- Full text content
  text TEXT NOT NULL,

  -- Parent element (chapter, part, section heading)
  parent TEXT,

  -- Additional metadata as JSON
  -- May include: effective_date, amended_by, version, notes
  metadata TEXT,

  -- Related items as JSON array
  -- Format: [{"type": "references", "source": "X", "item_id": "Y"}, ...]
  related TEXT,

  -- Ensure unique source + item_id combinations
  UNIQUE(source, item_id)
);

-- Index for efficient source + parent queries
CREATE INDEX idx_items_source_parent ON items(source, parent);

-- ═══════════════════════════════════════════════════════════════════════════
-- FULL-TEXT SEARCH (FTS5)
-- ═══════════════════════════════════════════════════════════════════════════
-- Virtual table for full-text search using SQLite FTS5
--
-- Features:
--   - BM25 relevance ranking
--   - Snippet extraction
--   - Boolean queries (AND, OR, NOT)
--   - Phrase search ("exact phrase")
--   - Prefix matching (cyber*)
--
-- The content='items' and content_rowid='rowid' options make this a
-- "content-less" FTS table that references the items table.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE VIRTUAL TABLE items_fts USING fts5(
  source,
  item_id,
  title,
  text,
  content='items',
  content_rowid='rowid',
  tokenize='unicode61'  -- Good for European languages
);

-- ─────────────────────────────────────────────────────────────────────────
-- FTS5 Synchronization Triggers
-- ─────────────────────────────────────────────────────────────────────────
-- These triggers keep the FTS index in sync with the items table.
-- Required when using content= option.
-- ─────────────────────────────────────────────────────────────────────────

-- After INSERT: Add to FTS index
CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, source, item_id, title, text)
  VALUES (new.rowid, new.source, new.item_id, new.title, new.text);
END;

-- After DELETE: Remove from FTS index
CREATE TRIGGER items_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, source, item_id, title, text)
  VALUES ('delete', old.rowid, old.source, old.item_id, old.title, old.text);
END;

-- After UPDATE: Update FTS index
CREATE TRIGGER items_au AFTER UPDATE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, source, item_id, title, text)
  VALUES ('delete', old.rowid, old.source, old.item_id, old.title, old.text);
  INSERT INTO items_fts(rowid, source, item_id, title, text)
  VALUES (new.rowid, new.source, new.item_id, new.title, new.text);
END;

-- ═══════════════════════════════════════════════════════════════════════════
-- DEFINITIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Official definitions of terms from your sources
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,

  -- Source that defines this term
  source TEXT NOT NULL REFERENCES sources(id),

  -- The defined term (as written in source)
  term TEXT NOT NULL,

  -- Official definition text
  definition TEXT NOT NULL,

  -- Item that contains this definition (e.g., "4" for Article 4)
  defining_item TEXT,

  -- Each source can only define a term once
  UNIQUE(source, term)
);

-- Index for case-insensitive term lookups
CREATE INDEX idx_definitions_term ON definitions(term COLLATE NOCASE);

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROL MAPPINGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Maps controls from frameworks (ISO 27001, NIST) to your sources
--
-- Enables questions like:
--   "Which GDPR articles implement ISO 27001 control A.5.1?"
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE mappings (
  id INTEGER PRIMARY KEY,

  -- Framework being mapped from
  -- Examples: "ISO27001", "NIST_CSF", "CIS"
  framework TEXT NOT NULL,

  -- Control identifier in the framework
  -- Examples: "A.5.1", "PR.AC-1", "1.1"
  control_id TEXT NOT NULL,

  -- Human-readable control name
  control_name TEXT,

  -- Target source being mapped to
  target_source TEXT NOT NULL REFERENCES sources(id),

  -- Target items as JSON array
  -- Example: ["25", "32", "35"]
  target_items TEXT NOT NULL,

  -- Coverage level
  -- full: Control fully addressed by these items
  -- partial: Control partially addressed
  -- related: Items are related but don't fully address
  coverage TEXT CHECK(coverage IN ('full', 'partial', 'related')),

  -- Additional notes about the mapping
  notes TEXT
);

-- Indexes for common queries
CREATE INDEX idx_mappings_framework ON mappings(framework);
CREATE INDEX idx_mappings_control ON mappings(framework, control_id);
CREATE INDEX idx_mappings_target ON mappings(target_source);

-- ═══════════════════════════════════════════════════════════════════════════
-- APPLICABILITY RULES TABLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Rules for determining if a source applies to an entity
--
-- Enables questions like:
--   "Does NIS2 apply to a financial services company?"
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE applicability_rules (
  id INTEGER PRIMARY KEY,

  -- Source this rule is about
  source TEXT NOT NULL REFERENCES sources(id),

  -- Sector the rule applies to
  -- Examples: "financial", "healthcare", "energy"
  sector TEXT NOT NULL,

  -- More specific subsector (optional)
  -- Examples: "banking", "insurance", "hospitals"
  subsector TEXT,

  -- Does the source apply? (1 = yes, 0 = no)
  applies INTEGER NOT NULL CHECK(applies IN (0, 1)),

  -- Confidence level
  -- definite: Clearly stated in source
  -- likely: Strongly implied
  -- possible: May apply depending on specifics
  confidence TEXT CHECK(confidence IN ('definite', 'likely', 'possible')),

  -- Item that establishes this rule
  basis_item TEXT,

  -- Additional conditions as JSON
  -- Example: {"employee_count": ">250", "turnover": ">50M EUR"}
  conditions TEXT,

  -- Notes explaining the rule
  notes TEXT
);

-- Index for sector lookups
CREATE INDEX idx_applicability_sector ON applicability_rules(sector);
CREATE INDEX idx_applicability_source ON applicability_rules(source);

-- ═══════════════════════════════════════════════════════════════════════════
-- SOURCE REGISTRY TABLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Metadata for tracking source updates and data quality
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE source_registry (
  -- Reference to source
  source TEXT PRIMARY KEY REFERENCES sources(id),

  -- Official identifier from source system
  official_id TEXT,

  -- Version string from source (for change detection)
  official_version TEXT,

  -- When we last fetched from source (ISO 8601)
  last_fetched TEXT,

  -- Expected number of items
  items_expected INTEGER,

  -- Actually parsed number of items
  items_parsed INTEGER,

  -- Data quality status
  -- complete: All items parsed successfully
  -- review: Some items need manual review
  -- incomplete: Missing items or parsing failures
  quality_status TEXT CHECK(quality_status IN ('complete', 'review', 'incomplete')),

  -- Notes about this source's data
  notes TEXT
);
`;

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BUILD FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the SQLite database from seed files
 *
 * This is the main function that orchestrates the build process:
 *
 *   1. Delete existing database
 *   2. Create new database with schema
 *   3. Load seed files
 *   4. Insert data
 *   5. Load mappings and applicability rules
 */
function buildDatabase(): void {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' DATABASE BUILDER');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Delete existing database
  // ─────────────────────────────────────────────────────────────────────────

  if (fs.existsSync(DB_PATH)) {
    console.log('🗑️  Deleting existing database...');
    fs.unlinkSync(DB_PATH);
  }

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Create new database
  // ─────────────────────────────────────────────────────────────────────────

  console.log('📦 Creating new database...');
  const db = new Database(DB_PATH);

  // Enable foreign keys and WAL mode for better performance
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Create schema
  // ─────────────────────────────────────────────────────────────────────────

  console.log('📐 Creating schema...');
  db.exec(SCHEMA);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Prepare insert statements
  // ─────────────────────────────────────────────────────────────────────────

  const insertSource = db.prepare(`
    INSERT INTO sources (id, full_name, identifier, effective_date, source_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO items (source, item_id, title, text, parent, metadata, related)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDefinition = db.prepare(`
    INSERT INTO definitions (source, term, definition, defining_item)
    VALUES (?, ?, ?, ?)
  `);

  const insertMapping = db.prepare(`
    INSERT INTO mappings (framework, control_id, control_name, target_source, target_items, coverage, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertApplicability = db.prepare(`
    INSERT INTO applicability_rules (source, sector, subsector, applies, confidence, basis_item, conditions, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRegistry = db.prepare(`
    INSERT INTO source_registry (source, official_id, last_fetched, items_expected, items_parsed, quality_status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Load and insert seed files
  // ─────────────────────────────────────────────────────────────────────────

  console.log('');
  console.log('📂 Loading seed files...');

  // Find all JSON files in seed directory (excluding subdirectories)
  const seedFiles = fs.readdirSync(SEED_DIR)
    .filter(f => f.endsWith('.json'))
    .filter(f => !f.startsWith('.'));

  if (seedFiles.length === 0) {
    console.log('⚠️  No seed files found in', SEED_DIR);
    console.log('   Create JSON files following the seed format.');
    db.close();
    return;
  }

  // Statistics
  let totalSources = 0;
  let totalItems = 0;
  let totalDefinitions = 0;

  // Process each seed file in a transaction
  const loadSources = db.transaction(() => {
    for (const file of seedFiles) {
      const filePath = path.join(SEED_DIR, file);
      console.log(`   📄 ${file}`);

      // Load and parse JSON
      const content = fs.readFileSync(filePath, 'utf-8');
      const seed = JSON.parse(content) as SourceSeed;

      // Insert source
      insertSource.run(
        seed.id,
        seed.full_name,
        seed.identifier ?? null,
        seed.effective_date ?? null,
        seed.source_url ?? null
      );
      totalSources++;

      // Insert items
      for (const item of seed.items) {
        insertItem.run(
          seed.id,
          item.item_id,
          item.title ?? null,
          item.text,
          item.parent ?? null,
          item.metadata ? JSON.stringify(item.metadata) : null,
          item.related ? JSON.stringify(item.related) : null
        );
        totalItems++;
      }

      // Insert definitions
      for (const def of seed.definitions ?? []) {
        insertDefinition.run(
          seed.id,
          def.term,
          def.definition,
          def.defining_item ?? null
        );
        totalDefinitions++;
      }

      // Insert registry entry
      insertRegistry.run(
        seed.id,
        seed.identifier ?? null,
        new Date().toISOString(),
        seed.items.length,
        seed.items.length,
        'complete'
      );

      console.log(`      └─ ${seed.items.length} items, ${seed.definitions?.length ?? 0} definitions`);
    }
  });

  loadSources();

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Load mappings (if any)
  // ─────────────────────────────────────────────────────────────────────────

  let totalMappings = 0;

  if (fs.existsSync(MAPPINGS_DIR)) {
    console.log('');
    console.log('🔗 Loading control mappings...');

    const mappingFiles = fs.readdirSync(MAPPINGS_DIR)
      .filter(f => f.endsWith('.json'));

    const loadMappings = db.transaction(() => {
      for (const file of mappingFiles) {
        const filePath = path.join(MAPPINGS_DIR, file);
        console.log(`   📄 ${file}`);

        const content = fs.readFileSync(filePath, 'utf-8');
        const seed = JSON.parse(content) as MappingSeed;

        for (const mapping of seed.mappings) {
          insertMapping.run(
            seed.framework,
            mapping.control_id,
            mapping.control_name,
            seed.target_source,
            JSON.stringify(mapping.target_items),
            mapping.coverage,
            mapping.notes ?? null
          );
          totalMappings++;
        }

        console.log(`      └─ ${seed.mappings.length} mappings`);
      }
    });

    loadMappings();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 7: Load applicability rules (if any)
  // ─────────────────────────────────────────────────────────────────────────

  let totalRules = 0;

  if (fs.existsSync(APPLICABILITY_DIR)) {
    console.log('');
    console.log('📋 Loading applicability rules...');

    const ruleFiles = fs.readdirSync(APPLICABILITY_DIR)
      .filter(f => f.endsWith('.json'));

    const loadRules = db.transaction(() => {
      for (const file of ruleFiles) {
        const filePath = path.join(APPLICABILITY_DIR, file);
        console.log(`   📄 ${file}`);

        const content = fs.readFileSync(filePath, 'utf-8');
        const seed = JSON.parse(content) as ApplicabilitySeed;

        for (const rule of seed.rules) {
          insertApplicability.run(
            seed.source,
            rule.sector,
            rule.subsector ?? null,
            rule.applies ? 1 : 0,
            rule.confidence,
            rule.basis_item ?? null,
            rule.conditions ? JSON.stringify(rule.conditions) : null,
            rule.notes ?? null
          );
          totalRules++;
        }

        console.log(`      └─ ${seed.rules.length} rules`);
      }
    });

    loadRules();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 8: Finalize
  // ─────────────────────────────────────────────────────────────────────────

  // Optimize database
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('ANALYZE');

  db.close();

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' BUILD COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`   📊 Sources:     ${totalSources}`);
  console.log(`   📄 Items:       ${totalItems}`);
  console.log(`   📖 Definitions: ${totalDefinitions}`);
  console.log(`   🔗 Mappings:    ${totalMappings}`);
  console.log(`   📋 Rules:       ${totalRules}`);
  console.log('');
  console.log(`   📦 Output: ${DB_PATH}`);
  console.log(`   📏 Size:   ${formatFileSize(fs.statSync(DB_PATH).size)}`);
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format file size in human-readable form
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════════════════

buildDatabase();
