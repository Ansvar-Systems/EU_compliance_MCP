#!/usr/bin/env tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UPDATE CHECKER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Checks if source data has been updated since last ingestion.
 *
 * This script compares your local source_registry against the latest
 * versions available from your data sources. Run it periodically to
 * detect when you need to re-ingest data.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * USAGE
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   npm run check-updates
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OUTPUT
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   For each source, shows:
 *     - Current local version
 *     - Latest remote version
 *     - Whether an update is available
 *     - Suggested re-ingestion command
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CUSTOMIZATION
 * ───────────────────────────────────────────────────────────────────────────
 *
 * You need to implement checkSourceVersion() for your data source:
 *
 *   - EUR-Lex: Check the "Date of document" in the metadata
 *   - lagen.nu: Check the "Senast ändrad" field
 *   - lovdata.no: Check the amendment date
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @module scripts/check-updates
 * @author Ansvar Systems AB
 * @license Apache-2.0
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to the local database */
const DB_PATH = path.resolve(__dirname, '../data/database.db');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Local source registry entry
 */
interface RegistryEntry {
  source: string;
  official_id: string | null;
  official_version: string | null;
  last_fetched: string | null;
  items_parsed: number;
  quality_status: string | null;
}

/**
 * Result of checking a source for updates
 */
interface UpdateCheckResult {
  source: string;
  official_id: string | null;
  local_version: string | null;
  local_date: string | null;
  remote_version: string | null;
  remote_date: string | null;
  has_update: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function checkUpdates(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' UPDATE CHECKER');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────
  // Check if database exists
  // ─────────────────────────────────────────────────────────────────────────

  if (!fs.existsSync(DB_PATH)) {
    console.log('⚠️  Database not found:', DB_PATH);
    console.log('   Run "npm run build:db" first.');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Load local registry
  // ─────────────────────────────────────────────────────────────────────────

  const db = new Database(DB_PATH, { readonly: true });

  const registry = db.prepare(`
    SELECT source, official_id, official_version, last_fetched, items_parsed, quality_status
    FROM source_registry
    ORDER BY source
  `).all() as RegistryEntry[];

  db.close();

  if (registry.length === 0) {
    console.log('⚠️  No sources in registry.');
    console.log('   Run "npm run ingest" to add sources.');
    process.exit(0);
  }

  console.log(`📋 Checking ${registry.length} source(s)...\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Check each source
  // ─────────────────────────────────────────────────────────────────────────

  const results: UpdateCheckResult[] = [];

  for (const entry of registry) {
    process.stdout.write(`   🔍 ${entry.source}... `);

    try {
      const result = await checkSourceVersion(entry);
      results.push(result);

      if (result.error) {
        console.log(`⚠️  ${result.error}`);
      } else if (result.has_update) {
        console.log('📦 UPDATE AVAILABLE');
      } else {
        console.log('✓ up to date');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`❌ Error: ${message}`);
      results.push({
        source: entry.source,
        official_id: entry.official_id,
        local_version: entry.official_version,
        local_date: entry.last_fetched,
        remote_version: null,
        remote_date: null,
        has_update: false,
        error: message,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const updates = results.filter(r => r.has_update);
  const errors = results.filter(r => r.error);
  const current = results.filter(r => !r.has_update && !r.error);

  console.log(`   ✓ Up to date:     ${current.length}`);
  console.log(`   📦 Updates:       ${updates.length}`);
  console.log(`   ⚠️  Errors:        ${errors.length}`);
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────
  // Show update commands
  // ─────────────────────────────────────────────────────────────────────────

  if (updates.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(' UPDATES AVAILABLE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    for (const update of updates) {
      console.log(`   📦 ${update.source}`);
      console.log(`      Local:  ${update.local_version || 'unknown'} (${update.local_date || 'unknown'})`);
      console.log(`      Remote: ${update.remote_version || 'unknown'} (${update.remote_date || 'unknown'})`);
      console.log('');
      console.log(`      To update:`);
      console.log(`        npm run ingest -- ${update.official_id} data/seed/${update.source.toLowerCase()}.json`);
      console.log(`        npm run build:db`);
      console.log('');
    }
  }

  // Exit with error code if updates available (useful for CI)
  if (updates.length > 0) {
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERSION CHECKING - CUSTOMIZE FOR YOUR SOURCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a source has been updated
 *
 * ⚠️ THIS IS A PLACEHOLDER - You must implement this for your source!
 *
 * Different sources expose version information differently:
 *
 *   - EUR-Lex: "Date of document" in HTML metadata
 *   - lagen.nu: "Senast ändrad" in page content
 *   - lovdata.no: Amendment date in document header
 *
 * @param entry - Local registry entry
 * @returns Update check result
 *
 * @example EUR-Lex implementation
 * ```typescript
 * async function checkSourceVersion(entry: RegistryEntry): Promise<UpdateCheckResult> {
 *   const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${entry.official_id}`;
 *   const response = await fetch(url);
 *   const html = await response.text();
 *
 *   // Extract date from HTML
 *   const dateMatch = html.match(/Date of document:\s*(\d{2}\/\d{2}\/\d{4})/);
 *   const remoteDate = dateMatch ? parseDate(dateMatch[1]) : null;
 *
 *   return {
 *     source: entry.source,
 *     official_id: entry.official_id,
 *     local_version: entry.official_version,
 *     local_date: entry.last_fetched,
 *     remote_version: remoteDate,
 *     remote_date: remoteDate,
 *     has_update: remoteDate !== entry.official_version,
 *   };
 * }
 * ```
 */
async function checkSourceVersion(entry: RegistryEntry): Promise<UpdateCheckResult> {
  // ─────────────────────────────────────────────────────────────────────────
  // PLACEHOLDER IMPLEMENTATION
  //
  // This just returns "no update" for all sources.
  // Replace with actual version checking for your data source.
  // ─────────────────────────────────────────────────────────────────────────

  // If no official_id, we can't check for updates
  if (!entry.official_id) {
    return {
      source: entry.source,
      official_id: null,
      local_version: entry.official_version,
      local_date: entry.last_fetched,
      remote_version: null,
      remote_date: null,
      has_update: false,
      error: 'No official_id - cannot check for updates',
    };
  }

  // TODO: Implement actual version checking for your source
  //
  // Example steps:
  // 1. Construct URL to check version
  // 2. Fetch metadata (not full document if possible)
  // 3. Extract version/date information
  // 4. Compare with local version

  // Placeholder: Assume no updates
  return {
    source: entry.source,
    official_id: entry.official_id,
    local_version: entry.official_version,
    local_date: entry.last_fetched,
    remote_version: entry.official_version,  // Same as local (placeholder)
    remote_date: entry.last_fetched,         // Same as local (placeholder)
    has_update: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════════════════

checkUpdates().catch(error => {
  console.error('');
  console.error('❌ Check failed:', error.message);
  process.exit(1);
});
