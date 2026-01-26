/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEST DATABASE FIXTURE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Creates an in-memory SQLite database with sample data for testing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IN-MEMORY?
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Using an in-memory database (':memory:') for tests provides:
 *
 *   1. SPEED - No disk I/O, tests run much faster
 *   2. ISOLATION - Each test suite gets a fresh database
 *   3. REPRODUCIBILITY - Same sample data every time
 *   4. NO CLEANUP - Database disappears when connection closes
 *
 * ───────────────────────────────────────────────────────────────────────────
 * USAGE
 * ───────────────────────────────────────────────────────────────────────────
 *
 * In your test files:
 *
 *   ```typescript
 *   import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db';
 *   import type { Database } from 'better-sqlite3';
 *
 *   describe('myTool', () => {
 *     let db: Database;
 *
 *     beforeAll(() => {
 *       db = createTestDatabase();
 *     });
 *
 *     afterAll(() => {
 *       closeTestDatabase(db);
 *     });
 *
 *     it('should work', async () => {
 *       const result = await myTool(db, { query: 'test' });
 *       expect(result).toBeDefined();
 *     });
 *   });
 *   ```
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CUSTOMIZATION
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Update the sample data to match your domain:
 *
 *   1. Update SAMPLE_SOURCES with relevant sources
 *   2. Update SAMPLE_ITEMS with representative items
 *   3. Update SAMPLE_DEFINITIONS with key terms
 *   4. Add any additional sample data (mappings, rules, etc.)
 *
 * The sample data should:
 *   - Cover all common scenarios
 *   - Include edge cases (null values, special characters)
 *   - Be small enough to understand easily
 *   - Be large enough to test filtering and pagination
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @module tests/fixtures/test-db
 * @author Ansvar Systems AB
 * @license Apache-2.0
 */

import Database from 'better-sqlite3';

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLE DATA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sample sources for testing
 *
 * Include at least 2-3 sources to test filtering.
 */
const SAMPLE_SOURCES = [
  {
    id: 'SOURCE_A',
    full_name: 'Test Source Alpha',
    identifier: 'TEST-A-001',
    effective_date: '2020-01-01',
    source_url: 'https://example.com/source-a',
  },
  {
    id: 'SOURCE_B',
    full_name: 'Test Source Beta',
    identifier: 'TEST-B-002',
    effective_date: '2022-06-15',
    source_url: 'https://example.com/source-b',
  },
  {
    id: 'SOURCE_C',
    full_name: 'Test Source Gamma (No Items)',
    identifier: 'TEST-C-003',
    effective_date: null,  // Test null handling
    source_url: null,
  },
];

/**
 * Sample items for testing
 *
 * Include various scenarios:
 *   - Items with/without titles
 *   - Items with/without parents
 *   - Items with searchable terms
 *   - Items with special characters
 */
const SAMPLE_ITEMS = [
  // SOURCE_A items
  {
    source: 'SOURCE_A',
    item_id: '1',
    title: 'Subject Matter and Scope',
    text: 'This source establishes rules for data protection and privacy. It applies to all processing of personal data.',
    parent: 'Chapter I',
  },
  {
    source: 'SOURCE_A',
    item_id: '2',
    title: 'Definitions',
    text: 'For the purposes of this source, the following definitions apply.',
    parent: 'Chapter I',
  },
  {
    source: 'SOURCE_A',
    item_id: '3',
    title: 'Principles',
    text: 'Personal data shall be processed lawfully, fairly and in a transparent manner.',
    parent: 'Chapter II',
  },
  {
    source: 'SOURCE_A',
    item_id: '4',
    title: null,  // Test null title
    text: 'The controller shall implement appropriate security measures to protect personal data.',
    parent: 'Chapter II',
  },
  {
    source: 'SOURCE_A',
    item_id: '5',
    title: 'Breach Notification',
    text: 'In the case of a personal data breach, the controller shall notify the supervisory authority without undue delay.',
    parent: 'Chapter III',
  },

  // SOURCE_B items
  {
    source: 'SOURCE_B',
    item_id: '1',
    title: 'Objective',
    text: 'This source aims to achieve a high common level of cybersecurity across the Union.',
    parent: 'Part I',
  },
  {
    source: 'SOURCE_B',
    item_id: '2',
    title: 'Scope of Application',
    text: 'This source applies to essential and important entities operating in critical sectors.',
    parent: 'Part I',
  },
  {
    source: 'SOURCE_B',
    item_id: '3',
    title: 'Security Requirements',
    text: 'Entities shall take appropriate and proportionate technical and organisational measures to manage the risks posed to the security of network and information systems.',
    parent: 'Part II',
  },
  {
    source: 'SOURCE_B',
    item_id: '4',
    title: 'Incident Reporting',
    text: 'Significant incidents shall be reported to the competent authority within 24 hours of becoming aware of the incident.',
    parent: 'Part II',
  },
  {
    source: 'SOURCE_B',
    item_id: '4(1)',  // Test subsection format
    title: 'Initial Notification',
    text: 'The initial notification shall include an assessment of whether the incident is suspected to be caused by unlawful or malicious activity.',
    parent: 'Part II',
  },

  // Item with special characters for search testing
  {
    source: 'SOURCE_A',
    item_id: '99',
    title: 'Special Cases',
    text: 'This section covers edge cases including: quotes "like this", apostrophes (it\'s important), and symbols & special characters (§, ©, ®).',
    parent: null,  // Test null parent
  },
];

/**
 * Sample definitions for testing
 */
const SAMPLE_DEFINITIONS = [
  {
    source: 'SOURCE_A',
    term: 'personal data',
    definition: 'any information relating to an identified or identifiable natural person',
    defining_item: '2',
  },
  {
    source: 'SOURCE_A',
    term: 'processing',
    definition: 'any operation performed on personal data, whether or not by automated means',
    defining_item: '2',
  },
  {
    source: 'SOURCE_A',
    term: 'controller',
    definition: 'the natural or legal person which determines the purposes and means of the processing',
    defining_item: '2',
  },
  {
    source: 'SOURCE_B',
    term: 'cybersecurity',
    definition: 'the activities necessary to protect network and information systems, their users, and affected persons from cyber threats',
    defining_item: '1',
  },
  {
    source: 'SOURCE_B',
    term: 'incident',
    definition: 'an event compromising the availability, authenticity, integrity or confidentiality of stored, transmitted or processed data',
    defining_item: '1',
  },
  {
    source: 'SOURCE_B',
    term: 'essential entity',
    definition: 'an entity that provides services essential to the maintenance of critical societal or economic activities',
    defining_item: '2',
  },
];

/**
 * Sample control mappings for testing
 */
const SAMPLE_MAPPINGS = [
  {
    framework: 'ISO27001',
    control_id: 'A.5.1',
    control_name: 'Policies for information security',
    target_source: 'SOURCE_A',
    target_items: JSON.stringify(['1', '3']),
    coverage: 'partial',
    notes: 'Addresses policy requirements',
  },
  {
    framework: 'ISO27001',
    control_id: 'A.8.2',
    control_name: 'Information classification',
    target_source: 'SOURCE_A',
    target_items: JSON.stringify(['3', '4']),
    coverage: 'full',
    notes: null,
  },
  {
    framework: 'ISO27001',
    control_id: 'A.12.1',
    control_name: 'Operational procedures',
    target_source: 'SOURCE_B',
    target_items: JSON.stringify(['3']),
    coverage: 'related',
    notes: 'Related to operational security',
  },
];

/**
 * Sample applicability rules for testing
 */
const SAMPLE_APPLICABILITY = [
  {
    source: 'SOURCE_A',
    sector: 'financial',
    subsector: 'banking',
    applies: 1,
    confidence: 'definite',
    basis_item: '1',
    conditions: null,
    notes: 'All financial institutions are covered',
  },
  {
    source: 'SOURCE_A',
    sector: 'healthcare',
    subsector: null,
    applies: 1,
    confidence: 'likely',
    basis_item: '1',
    conditions: JSON.stringify({ processing_health_data: true }),
    notes: 'Applies when processing health data',
  },
  {
    source: 'SOURCE_B',
    sector: 'energy',
    subsector: 'electricity',
    applies: 1,
    confidence: 'definite',
    basis_item: '2',
    conditions: null,
    notes: 'Energy sector is explicitly covered',
  },
  {
    source: 'SOURCE_B',
    sector: 'retail',
    subsector: null,
    applies: 0,
    confidence: 'likely',
    basis_item: '2',
    conditions: null,
    notes: 'Retail generally not in scope unless critical',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Test database schema
 *
 * This should match your production schema in build-db.ts
 */
const SCHEMA = `
  -- Sources
  CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    identifier TEXT UNIQUE,
    effective_date TEXT,
    source_url TEXT
  );

  -- Items
  CREATE TABLE items (
    rowid INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    item_id TEXT NOT NULL,
    title TEXT,
    text TEXT NOT NULL,
    parent TEXT,
    metadata TEXT,
    related TEXT,
    UNIQUE(source, item_id)
  );

  -- FTS5 Index
  CREATE VIRTUAL TABLE items_fts USING fts5(
    source, item_id, title, text,
    content='items', content_rowid='rowid'
  );

  -- FTS Triggers
  CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
    INSERT INTO items_fts(rowid, source, item_id, title, text)
    VALUES (new.rowid, new.source, new.item_id, new.title, new.text);
  END;

  CREATE TRIGGER items_ad AFTER DELETE ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, source, item_id, title, text)
    VALUES ('delete', old.rowid, old.source, old.item_id, old.title, old.text);
  END;

  -- Definitions
  CREATE TABLE definitions (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    term TEXT NOT NULL,
    definition TEXT NOT NULL,
    defining_item TEXT,
    UNIQUE(source, term)
  );

  -- Mappings
  CREATE TABLE mappings (
    id INTEGER PRIMARY KEY,
    framework TEXT NOT NULL,
    control_id TEXT NOT NULL,
    control_name TEXT,
    target_source TEXT NOT NULL,
    target_items TEXT NOT NULL,
    coverage TEXT,
    notes TEXT
  );

  -- Applicability Rules
  CREATE TABLE applicability_rules (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    sector TEXT NOT NULL,
    subsector TEXT,
    applies INTEGER NOT NULL,
    confidence TEXT,
    basis_item TEXT,
    conditions TEXT,
    notes TEXT
  );
`;

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a test database with sample data
 *
 * Creates an in-memory SQLite database, applies the schema,
 * and populates it with sample data.
 *
 * @returns Database connection (remember to close it!)
 *
 * @example
 * ```typescript
 * const db = createTestDatabase();
 *
 * // Run your tests...
 * const result = await myTool(db, input);
 *
 * // Clean up
 * closeTestDatabase(db);
 * ```
 */
export function createTestDatabase(): Database.Database {
  // Create in-memory database
  const db = new Database(':memory:');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create schema
  db.exec(SCHEMA);

  // Insert sample data
  insertSampleData(db);

  return db;
}

/**
 * Close the test database
 *
 * Always call this in your afterAll() hook to release resources.
 *
 * @param db - Database connection to close
 */
export function closeTestDatabase(db: Database.Database): void {
  if (db) {
    db.close();
  }
}

/**
 * Get a specific sample source by ID
 *
 * Useful for verifying test results match expected data.
 *
 * @param sourceId - Source ID to find
 * @returns Sample source or undefined
 */
export function getSampleSource(sourceId: string) {
  return SAMPLE_SOURCES.find(s => s.id === sourceId);
}

/**
 * Get a specific sample item
 *
 * @param source - Source ID
 * @param itemId - Item ID
 * @returns Sample item or undefined
 */
export function getSampleItem(source: string, itemId: string) {
  return SAMPLE_ITEMS.find(i => i.source === source && i.item_id === itemId);
}

/**
 * Get sample items for a source
 *
 * @param source - Source ID
 * @returns All sample items for the source
 */
export function getSampleItemsForSource(source: string) {
  return SAMPLE_ITEMS.filter(i => i.source === source);
}

/**
 * Get sample definitions for a source
 *
 * @param source - Source ID
 * @returns All sample definitions for the source
 */
export function getSampleDefinitionsForSource(source: string) {
  return SAMPLE_DEFINITIONS.filter(d => d.source === source);
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insert all sample data into the database
 */
function insertSampleData(db: Database.Database): void {
  // Insert sources
  const insertSource = db.prepare(`
    INSERT INTO sources (id, full_name, identifier, effective_date, source_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const source of SAMPLE_SOURCES) {
    insertSource.run(
      source.id,
      source.full_name,
      source.identifier,
      source.effective_date,
      source.source_url
    );
  }

  // Insert items
  const insertItem = db.prepare(`
    INSERT INTO items (source, item_id, title, text, parent)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const item of SAMPLE_ITEMS) {
    insertItem.run(
      item.source,
      item.item_id,
      item.title,
      item.text,
      item.parent
    );
  }

  // Insert definitions
  const insertDef = db.prepare(`
    INSERT INTO definitions (source, term, definition, defining_item)
    VALUES (?, ?, ?, ?)
  `);

  for (const def of SAMPLE_DEFINITIONS) {
    insertDef.run(
      def.source,
      def.term,
      def.definition,
      def.defining_item
    );
  }

  // Insert mappings
  const insertMapping = db.prepare(`
    INSERT INTO mappings (framework, control_id, control_name, target_source, target_items, coverage, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const mapping of SAMPLE_MAPPINGS) {
    insertMapping.run(
      mapping.framework,
      mapping.control_id,
      mapping.control_name,
      mapping.target_source,
      mapping.target_items,
      mapping.coverage,
      mapping.notes
    );
  }

  // Insert applicability rules
  const insertRule = db.prepare(`
    INSERT INTO applicability_rules (source, sector, subsector, applies, confidence, basis_item, conditions, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const rule of SAMPLE_APPLICABILITY) {
    insertRule.run(
      rule.source,
      rule.sector,
      rule.subsector,
      rule.applies,
      rule.confidence,
      rule.basis_item,
      rule.conditions,
      rule.notes
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS FOR DIRECT DATA ACCESS IN TESTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export sample data for use in tests
 *
 * This allows tests to verify results against expected data
 * without hardcoding values.
 */
export const sampleData = {
  sources: SAMPLE_SOURCES,
  items: SAMPLE_ITEMS,
  definitions: SAMPLE_DEFINITIONS,
  mappings: SAMPLE_MAPPINGS,
  applicability: SAMPLE_APPLICABILITY,
};
