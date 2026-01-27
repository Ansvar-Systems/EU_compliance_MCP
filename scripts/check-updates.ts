#!/usr/bin/env npx tsx

/**
 * Check for updates to EU regulations from EUR-Lex.
 * Compares current database versions against EUR-Lex metadata.
 *
 * Usage: npx tsx scripts/check-updates.ts
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'data', 'regulations.db');

interface SourceRecord {
  regulation: string;
  celex_id: string;
  eur_lex_version: string | null;
  last_fetched: string | null;
  articles_expected: number | null;
  articles_parsed: number | null;
  quality_status: string;
}

interface EurLexMetadata {
  celexId: string;
  lastModified: string;
  title: string;
  dateDocument: string;
  consolidatedVersions?: string[];
}

// No hardcoded list - source_registry table IS the source of truth
// To add a new regulation: ingest it, and it's automatically monitored

async function fetchEurLexMetadata(celexId: string): Promise<EurLexMetadata | null> {
  const infoUrl = `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celexId}`;

  try {
    const response = await fetch(infoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EU-Compliance-MCP/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch metadata for ${celexId}: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Try multiple extraction methods in order of reliability:

    // 1. ELI metadata (works for all document types including UNECE)
    const eliDateDoc = html.match(/property="eli:date_document"[^>]*content="(\d{4}-\d{2}-\d{2})"/);
    const eliDatePub = html.match(/property="eli:date_publication"[^>]*content="(\d{4}-\d{2}-\d{2})"/);
    // Also try the reverse attribute order
    const eliDateDoc2 = html.match(/content="(\d{4}-\d{2}-\d{2})"[^>]*property="eli:date_document"/);
    const eliDatePub2 = html.match(/content="(\d{4}-\d{2}-\d{2})"[^>]*property="eli:date_publication"/);

    // 2. Visible text patterns
    const dateMatch = html.match(/Date of document:\s*(\d{2}\/\d{2}\/\d{4})/i);

    // 3. Generic ELI date pattern (fallback)
    const genericEli = html.match(/eli[^>]*(\d{4}-\d{2}-\d{2})/i);

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);

    // Use the best available date (prefer publication date for tracking updates)
    const lastModified =
      eliDatePub?.[1] || eliDatePub2?.[1] ||
      eliDateDoc?.[1] || eliDateDoc2?.[1] ||
      genericEli?.[1] ||
      (dateMatch?.[1] ? convertDateFormat(dateMatch[1]) : null) ||
      'unknown';

    return {
      celexId,
      lastModified,
      title: titleMatch?.[1]?.trim() || 'Unknown',
      dateDocument: eliDateDoc?.[1] || eliDateDoc2?.[1] || 'unknown',
    };
  } catch (error) {
    console.error(`Error fetching metadata for ${celexId}:`, error);
    return null;
  }
}

// Convert DD/MM/YYYY to YYYY-MM-DD
function convertDateFormat(date: string): string {
  const parts = date.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return date;
}

// Sync mode: update database with current EUR-Lex versions
async function syncVersions(): Promise<void> {
  console.log('Syncing EUR-Lex versions to database...\n');

  if (!existsSync(DB_PATH)) {
    console.log('Database not found. Run `npm run build:db` first.');
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  const sources = db.prepare(`
    SELECT regulation, celex_id FROM source_registry
    WHERE celex_id IS NOT NULL AND celex_id != ''
  `).all() as SourceRecord[];

  const updateStmt = db.prepare(`
    UPDATE source_registry SET eur_lex_version = ?, last_fetched = ?
    WHERE regulation = ?
  `);

  const now = new Date().toISOString();
  let updated = 0;

  for (const source of sources) {
    process.stdout.write(`${source.regulation}: `);
    const metadata = await fetchEurLexMetadata(source.celex_id);

    if (metadata && metadata.lastModified !== 'unknown') {
      updateStmt.run(metadata.lastModified, now, source.regulation);
      console.log(`synced to ${metadata.lastModified}`);
      updated++;
    } else {
      console.log('skipped (unknown version)');
    }
  }

  db.close();
  console.log(`\n✓ Synced ${updated} regulation(s)`);
}

async function checkForUpdates(): Promise<void> {
  console.log('Checking EUR-Lex for regulation updates...\n');

  // Check if database exists
  if (!existsSync(DB_PATH)) {
    console.log('Database not found. Run `npm run build:db` first.');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  // Get all regulations from source_registry - this IS the source of truth
  const sources = db.prepare(`
    SELECT regulation, celex_id, eur_lex_version, last_fetched, quality_status
    FROM source_registry
    WHERE celex_id IS NOT NULL AND celex_id != ''
    ORDER BY regulation
  `).all() as SourceRecord[];

  if (sources.length === 0) {
    console.log('No regulations found in source_registry.');
    console.log('Ingest regulations first with: npx tsx scripts/ingest-eurlex.ts <CELEX_ID> <output.json>');
    db.close();
    process.exit(0);
  }

  console.log(`Found ${sources.length} regulation(s) to check\n`);
  console.log('Status Report');
  console.log('='.repeat(80));

  const updates: Array<{ id: string; celex_id: string; reason: string }> = [];

  for (const source of sources) {
    process.stdout.write(`\n${source.regulation.padEnd(20)} (${source.celex_id}): `);

    // Fetch current EUR-Lex metadata
    const metadata = await fetchEurLexMetadata(source.celex_id);

    if (!metadata) {
      console.log('FETCH FAILED');
      continue;
    }

    const lastFetched = source.last_fetched || 'never';
    const eurLexVersion = metadata.lastModified;

    // Helper to compare dates (returns true if eurLex is newer)
    const isNewer = (eurLex: string, local: string): boolean => {
      if (eurLex === 'unknown' || !eurLex) return false;
      try {
        const eurLexDate = new Date(eurLex);
        const localDate = new Date(local);
        return eurLexDate > localDate;
      } catch {
        return false;
      }
    };

    if (eurLexVersion === 'unknown') {
      // UNECE or non-standard documents - can't auto-check
      console.log('MANUAL CHECK REQUIRED');
      console.log(`  Source type: Non-standard (UNECE/consolidated)`);
      console.log(`  Last fetched: ${lastFetched}`);
    } else if (!source.eur_lex_version) {
      // First time checking - record the version but don't flag as update
      console.log('VERSION NOT TRACKED');
      console.log(`  EUR-Lex version: ${eurLexVersion}`);
      console.log(`  Run ingest again to record version`);
    } else if (isNewer(eurLexVersion, source.eur_lex_version)) {
      // EUR-Lex has a newer version
      console.log('UPDATE AVAILABLE');
      console.log(`  Local version:  ${source.eur_lex_version}`);
      console.log(`  EUR-Lex version: ${eurLexVersion}`);
      updates.push({
        id: source.regulation,
        celex_id: source.celex_id,
        reason: `Newer version: ${source.eur_lex_version} -> ${eurLexVersion}`
      });
    } else if (source.quality_status !== 'complete') {
      console.log(`INCOMPLETE (${source.quality_status})`);
      updates.push({
        id: source.regulation,
        celex_id: source.celex_id,
        reason: `Quality status: ${source.quality_status}`
      });
    } else {
      console.log('UP TO DATE');
      console.log(`  EUR-Lex version: ${eurLexVersion}`);
      console.log(`  Last fetched: ${lastFetched}`);
    }
  }

  db.close();

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));

  if (updates.length === 0) {
    console.log('\n✓ All monitored regulations are up to date.');
  } else {
    console.log(`\n⚠ ${updates.length} regulation(s) need attention:\n`);
    for (const u of updates) {
      console.log(`  - ${u.id}: ${u.reason}`);
    }

    console.log('\nTo update, run:');
    for (const u of updates) {
      console.log(`  npx tsx scripts/ingest-eurlex.ts ${u.celex_id} data/seed/${u.id.toLowerCase()}.json`);
    }
    console.log('\nThen: npm run build:db');
  }

  // Output for CI: write CELEX IDs to file for workflow to use
  const celexList = sources.map(s => s.celex_id).join('|');
  console.log(`\n::set-output name=celex_pattern::${celexList}`);
}

// Also provide a function to update the source registry after ingestion
export async function updateSourceRegistry(
  db: Database.Database,
  regulation: string,
  celexId: string,
  articleCount: number
): Promise<void> {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO source_registry
    (regulation, celex_id, eur_lex_version, last_fetched, articles_expected, articles_parsed, quality_status)
    VALUES (?, ?, ?, ?, ?, ?, 'complete')
  `).run(regulation, celexId, now.split('T')[0], now, articleCount, articleCount);
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--sync')) {
  syncVersions().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
} else {
  checkForUpdates().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
