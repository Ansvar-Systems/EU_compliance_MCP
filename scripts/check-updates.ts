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

// Known regulations to monitor
const MONITORED_REGULATIONS = [
  { celex_id: '32016R0679', id: 'GDPR', name: 'General Data Protection Regulation' },
  { celex_id: '32022L2555', id: 'NIS2', name: 'NIS2 Directive' },
  { celex_id: '32022R2554', id: 'DORA', name: 'Digital Operational Resilience Act' },
  { celex_id: '32024R1689', id: 'AI_ACT', name: 'Artificial Intelligence Act' },
  { celex_id: '32024R2847', id: 'CRA', name: 'Cyber Resilience Act' },
  { celex_id: '32019R0881', id: 'CYBERSECURITY_ACT', name: 'EU Cybersecurity Act' },
];

async function fetchEurLexMetadata(celexId: string): Promise<EurLexMetadata | null> {
  // Use EUR-Lex REST API to get document metadata
  const metadataUrl = `https://eur-lex.europa.eu/search.html?SUBDOM_INIT=LEGISLATION&DB_TYPE_OF_ACT=regulation&DTS_SUBDOM=LEGISLATION&typeOfActStatus=REGULATION&qid=1&FM_CODED=REG&type=advanced&DTS_DOM=ALL&page=1&lang=en&CELEX=${celexId}`;

  // Alternative: use the document info endpoint
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

    // Extract last modified from HTML meta tags or content
    const dateMatch = html.match(/Date of document:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const lastModMatch = html.match(/ELI.*?(\d{4}-\d{2}-\d{2})/i);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);

    // Check for consolidated versions indicator
    const hasConsolidated = html.includes('Consolidated text') || html.includes('consolidated version');

    return {
      celexId,
      lastModified: lastModMatch?.[1] || dateMatch?.[1] || 'unknown',
      title: titleMatch?.[1]?.trim() || 'Unknown',
      dateDocument: dateMatch?.[1] || 'unknown',
    };
  } catch (error) {
    console.error(`Error fetching metadata for ${celexId}:`, error);
    return null;
  }
}

async function checkForUpdates(): Promise<void> {
  console.log('Checking EUR-Lex for regulation updates...\n');

  // Check if database exists
  if (!existsSync(DB_PATH)) {
    console.log('Database not found. Run `npm run build:db` first.');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  // Get current source registry
  const sources = db.prepare(`
    SELECT regulation, celex_id, eur_lex_version, last_fetched, quality_status
    FROM source_registry
  `).all() as SourceRecord[];

  const sourceMap = new Map(sources.map(s => [s.celex_id, s]));

  console.log('Status Report');
  console.log('='.repeat(80));

  const updates: Array<{ id: string; celex_id: string; reason: string }> = [];

  for (const reg of MONITORED_REGULATIONS) {
    const source = sourceMap.get(reg.celex_id);

    process.stdout.write(`\n${reg.id.padEnd(20)} (${reg.celex_id}): `);

    if (!source) {
      console.log('NOT INGESTED');
      updates.push({ id: reg.id, celex_id: reg.celex_id, reason: 'Not yet ingested' });
      continue;
    }

    // Fetch current EUR-Lex metadata
    const metadata = await fetchEurLexMetadata(reg.celex_id);

    if (!metadata) {
      console.log('FETCH FAILED');
      continue;
    }

    const lastFetched = source.last_fetched || 'never';
    const eurLexVersion = metadata.lastModified;

    if (source.eur_lex_version !== eurLexVersion && source.eur_lex_version) {
      console.log('UPDATE AVAILABLE');
      console.log(`  Local version:  ${source.eur_lex_version}`);
      console.log(`  EUR-Lex version: ${eurLexVersion}`);
      updates.push({ id: reg.id, celex_id: reg.celex_id, reason: `Version changed: ${source.eur_lex_version} -> ${eurLexVersion}` });
    } else if (source.quality_status !== 'complete') {
      console.log(`INCOMPLETE (${source.quality_status})`);
      updates.push({ id: reg.id, celex_id: reg.celex_id, reason: `Quality status: ${source.quality_status}` });
    } else {
      console.log('UP TO DATE');
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

checkForUpdates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
