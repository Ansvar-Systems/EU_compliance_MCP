#!/usr/bin/env npx tsx

/**
 * Version-history ingestion for the chassis-shape database (provision_versions).
 *
 * Rewritten 2026-06-10 for the chassis schema (issue #70): the original
 * targeted the legacy `articles` / `article_versions` tables deleted in the
 * Phase 5.A→5.C chassis migration. Reads `provisions` (canonical_ref
 * 'REG:art_N' / 'REG:annex_N'), writes `provision_versions` — the table the
 * chassis version-tracking tools (get_provision_history,
 * diff_provision_versions, get_recent_changes) serve from.
 *
 * Modes:
 *   --seed-baseline   One baseline row per provision (no network). Honest
 *                     semantics: effective_date = the regulation's entry-into-
 *                     application date (source_registry.eur_lex_version, which
 *                     build-db.ts populates from the seed's effective_date);
 *                     body_text = the consolidated text as ingested. Amendment
 *                     tracking begins at this snapshot — the baseline does NOT
 *                     claim to reconstruct pre-snapshot amendment history.
 *   (default)         Diff mode: fetch fresh consolidated text from EUR-Lex,
 *                     compare against the current provisions body, insert a
 *                     new version row per changed article with a unified diff.
 *
 * Usage:
 *   npx tsx scripts/ingest-version-history.ts --seed-baseline
 *   npx tsx scripts/ingest-version-history.ts                  # diff all
 *   npx tsx scripts/ingest-version-history.ts --regulation NIS2
 *   npx tsx scripts/ingest-version-history.ts --dry-run
 *   npx tsx scripts/ingest-version-history.ts --with-summaries # AI summaries
 *
 * For AI summaries, set ANTHROPIC_API_KEY in environment.
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = process.env.EU_COMPLIANCE_DB_PATH ?? join(__dirname, '..', 'data', 'regulations.db');

// --- Types ---

interface ProvisionRow {
  canonical_ref: string;
  body: string;
  source_url: string | null;
}

interface SourceRow {
  regulation: string;
  celex_id: string;
  eur_lex_version: string | null;
}

interface VersionRow {
  id: number;
  body_text: string | null;
  effective_date: string | null;
}

interface CliOptions {
  regulation: string | null;
  dryRun: boolean;
  withSummaries: boolean;
  seedBaseline: boolean;
}

// --- CLI ---

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  const regulation = getFlag(args, '--regulation');
  const dryRun = args.includes('--dry-run');
  const withSummaries = args.includes('--with-summaries');
  const seedBaseline = args.includes('--seed-baseline');
  return { regulation, dryRun, withSummaries, seedBaseline };
}

function getFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) return null;
  return args[index + 1];
}

// --- Diff ---

/**
 * Simple unified diff implementation. Compares line-by-line and produces
 * a unified diff string without external dependencies.
 */
function computeUnifiedDiff(oldText: string, newText: string, label: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const header = [`--- a/${label}`, `+++ b/${label}`];

  const hunks: string[] = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
      continue;
    }
    const startI = i;
    const startJ = j;
    const hunkLines: string[] = [];
    while (
      (i < oldLines.length || j < newLines.length) &&
      !(i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j])
    ) {
      if (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
        hunkLines.push(`-${oldLines[i]}`);
        i++;
      } else {
        hunkLines.push(`+${newLines[j]}`);
        j++;
      }
    }
    if (hunkLines.length > 0) {
      const removals = hunkLines.filter((l) => l.startsWith('-')).length;
      const additions = hunkLines.filter((l) => l.startsWith('+')).length;
      hunks.push(`@@ -${startI + 1},${removals} +${startJ + 1},${additions} @@`);
      hunks.push(...hunkLines);
    }
  }

  if (hunks.length === 0) return '';
  return [...header, ...hunks].join('\n');
}

// --- AI Summary (optional) ---

async function generateChangeSummary(
  regulation: string,
  article: string,
  diff: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: `Summarize in 1-2 sentences what changed in ${regulation} Article ${article}. Be specific about what was added, removed, or modified. Output only the summary, no preamble.\n\nDiff:\n${diff.slice(0, 3000)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(`  AI summary failed (${response.status}), skipping`);
      return null;
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content[0]?.text ?? null;
  } catch (error) {
    console.warn(`  AI summary error: ${(error as Error).message}`);
    return null;
  }
}

// --- EUR-Lex fetching (diff mode) ---

async function fetchArticleTexts(celexId: string): Promise<Map<string, string>> {
  const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celexId}`;
  console.log(`  Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; EU-Compliance-MCP/1.0; +https://github.com/Ansvar-Systems/EU_compliance_MCP)',
      Accept: 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`EUR-Lex fetch failed: ${response.status}`);
  }

  const html = await response.text();
  return parseArticlesFromHtml(html);
}

async function parseArticlesFromHtml(html: string): Promise<Map<string, string>> {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const articles = new Map<string, string>();
  const allText = doc.body?.textContent || '';
  const lines = allText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let currentNumber: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^Article\s+(\d+[a-z]?)\s*$/i);
    if (match) {
      if (currentNumber !== null && currentLines.length > 0) {
        articles.set(currentNumber, currentLines.join('\n\n'));
      }
      currentNumber = match[1];
      currentLines = [];
    } else if (currentNumber !== null) {
      currentLines.push(line);
    }
  }
  if (currentNumber !== null && currentLines.length > 0) {
    articles.set(currentNumber, currentLines.join('\n\n'));
  }

  return articles;
}

// --- Main ---

async function main(): Promise<void> {
  const options = parseOptions();

  if (!existsSync(DB_PATH)) {
    console.error('Database not found. Run `npm run build:db` first.');
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  // The chassis-shape build-db.ts creates provision_versions; fail loudly if
  // this is a pre-chassis or foreign DB rather than silently creating a
  // divergent table (No Silent Fallbacks).
  const hasTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='provision_versions'",
    )
    .get();
  if (!hasTable) {
    console.error(
      'provision_versions table not found — this DB predates the chassis schema. Run `npm run build:db` first.',
    );
    process.exit(1);
  }

  let sourceQuery = 'SELECT regulation, celex_id, eur_lex_version FROM source_registry';
  const params: string[] = [];
  if (options.regulation) {
    sourceQuery += ' WHERE regulation = ?';
    params.push(options.regulation);
  }
  const sources = db.prepare(sourceQuery).all(...params) as SourceRow[];

  if (sources.length === 0) {
    console.log('No regulations found in source_registry.');
    db.close();
    return;
  }

  console.log(
    `Processing ${sources.length} regulation(s)${options.dryRun ? ' (DRY RUN)' : ''}${options.seedBaseline ? ' (SEED BASELINE)' : ''}\n`,
  );

  const insertVersion = db.prepare(`
    INSERT INTO provision_versions
      (canonical_ref, version_label, effective_date, superseded_date, body_text, change_summary, diff_from_previous, source_url, scraped_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
  `);

  const updateSuperseded = db.prepare(`
    UPDATE provision_versions
    SET superseded_date = ?
    WHERE canonical_ref = ? AND superseded_date IS NULL AND id != ?
  `);

  const getLatestVersion = db.prepare(`
    SELECT id, body_text, effective_date
    FROM provision_versions
    WHERE canonical_ref = ?
    ORDER BY scraped_at DESC
    LIMIT 1
  `);

  // All non-meta provisions of one regulation (articles + annexes). The
  // {REG}:meta title-boost rows are search aids, not legal text — they get
  // no version history.
  const getProvisions = db.prepare(`
    SELECT canonical_ref, body, source_url
    FROM provisions
    WHERE canonical_ref LIKE ? AND canonical_ref != ?
  `);

  let totalInserted = 0;
  let totalUnchanged = 0;
  let totalErrors = 0;

  for (const source of sources) {
    const provisions = getProvisions.all(
      `${source.regulation}:%`,
      `${source.regulation}:meta`,
    ) as ProvisionRow[];

    if (provisions.length === 0) {
      console.log(`--- ${source.regulation}: no provisions, skipping`);
      continue;
    }

    if (options.seedBaseline) {
      // Baseline: one row per provision, effective from the regulation's
      // entry-into-application date. Idempotent — provisions that already
      // have any version row are skipped.
      const now = new Date().toISOString();
      let seeded = 0;
      let skipped = 0;
      const tx = db.transaction(() => {
        for (const p of provisions) {
          const existing = getLatestVersion.get(p.canonical_ref) as VersionRow | undefined;
          if (existing) {
            skipped++;
            continue;
          }
          if (!options.dryRun) {
            insertVersion.run(
              p.canonical_ref,
              'baseline',
              source.eur_lex_version,
              p.body,
              'Corpus baseline — consolidated text as ingested. Amendment tracking begins at this snapshot.',
              null,
              p.source_url,
              now,
            );
          }
          seeded++;
        }
      });
      tx();
      totalInserted += seeded;
      console.log(
        `--- ${source.regulation}: baseline ${seeded} provisions (effective ${source.eur_lex_version ?? 'unknown'})${skipped > 0 ? `, ${skipped} already versioned` : ''}`,
      );
      continue;
    }

    // Diff mode: fetch fresh consolidated text from EUR-Lex, compare.
    console.log(`\n--- ${source.regulation} (${source.celex_id}) ---`);
    let freshTexts: Map<string, string>;
    try {
      freshTexts = await fetchArticleTexts(source.celex_id);
      console.log(`  ${freshTexts.size} articles fetched from EUR-Lex`);
    } catch (error) {
      console.error(`  ERROR fetching ${source.celex_id}: ${(error as Error).message}`);
      totalErrors++;
      continue;
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    let changed = 0;
    let unchanged = 0;

    for (const provision of provisions) {
      const artMatch = provision.canonical_ref.match(/:art_(\d+[a-z]?)$/);
      if (!artMatch) continue; // annexes: the EUR-Lex HTML parse covers articles only
      const articleNumber = artMatch[1];
      const freshText = freshTexts.get(articleNumber);
      if (!freshText) continue;

      const normalizedCurrent = provision.body.replace(/\s+/g, ' ').trim();
      const normalizedFresh = freshText.replace(/\s+/g, ' ').trim();
      if (normalizedCurrent === normalizedFresh) {
        unchanged++;
        continue;
      }

      const diff = computeUnifiedDiff(provision.body, freshText, provision.canonical_ref);

      let summary: string | null = null;
      if (options.withSummaries) {
        summary = await generateChangeSummary(source.regulation, articleNumber, diff);
        if (summary) console.log(`    ${provision.canonical_ref}: ${summary}`);
      }

      if (!options.dryRun) {
        const result = insertVersion.run(
          provision.canonical_ref,
          today,
          today,
          freshText,
          summary ?? 'Text change detected against the EUR-Lex consolidated version.',
          diff,
          provision.source_url,
          now,
        );
        updateSuperseded.run(today, provision.canonical_ref, Number(result.lastInsertRowid));
      }

      changed++;
      const addedLines = diff.split('\n').filter((l) => l.startsWith('+')).length - 1;
      const removedLines = diff.split('\n').filter((l) => l.startsWith('-')).length - 1;
      console.log(
        `    ${provision.canonical_ref}: CHANGED (+${addedLines}/-${removedLines} lines)`,
      );
    }

    console.log(
      `  Result: ${changed} changed, ${unchanged} unchanged${options.dryRun ? ' (dry run)' : ''}`,
    );
    totalInserted += changed;
    totalUnchanged += unchanged;
  }

  db.close();

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`  New versions inserted: ${totalInserted}`);
  console.log(`  Provisions unchanged: ${totalUnchanged}`);
  console.log(`  Errors: ${totalErrors}`);
  if (options.dryRun) console.log('  (DRY RUN - no changes written)');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
