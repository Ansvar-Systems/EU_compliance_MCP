#!/usr/bin/env npx tsx

/**
 * Bulk re-ingestion script for all 37 EU regulations.
 *
 * Uses Puppeteer-based browser ingestion to bypass EUR-Lex WAF.
 * Processes regulations in batches of 3 parallel browser instances
 * with 2s delays between batches for rate limiting.
 *
 * Usage:
 *   npx tsx scripts/bulk-reingest-all.ts
 *   npx tsx scripts/bulk-reingest-all.ts --dry-run  # Preview without executing
 *
 * SECURITY NOTE: Uses execFile (not exec) to prevent command injection.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readdir } from 'fs/promises';
import { join, basename } from 'path';

const execFileAsync = promisify(execFile);

interface Regulation {
  celexId: string;
  filename: string;
  filepath: string;
}

interface IngestionResult {
  regulation: string;
  success: boolean;
  error?: string;
  duration?: number;
}

// Configuration
const BATCH_SIZE = 3; // Parallel browser instances
const BATCH_DELAY_MS = 2000; // Rate limiting between batches
const TIMEOUT_MS = 120000; // 2 minutes per regulation

/**
 * Discover all regulation JSON files in data/seed/
 */
async function discoverRegulations(): Promise<Regulation[]> {
  const seedDir = join(process.cwd(), 'data', 'seed');
  const files = await readdir(seedDir);

  const regulations: Regulation[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const filepath = join(seedDir, file);
    const filename = basename(file, '.json');

    // Read JSON to extract CELEX ID
    try {
      const { readFileSync } = await import('fs');
      const content = readFileSync(filepath, 'utf-8');
      const data = JSON.parse(content);

      if (data.celex_id) {
        regulations.push({
          celexId: data.celex_id,
          filename,
          filepath,
        });
      } else {
        console.warn(`⚠️  Warning: ${file} has no celex_id field`);
      }
    } catch (err) {
      console.warn(`⚠️  Warning: Failed to parse ${file}:`, (err as Error).message);
    }
  }

  return regulations.sort((a, b) => a.filename.localeCompare(b.filename));
}

/**
 * Ingest a single regulation using the appropriate script
 */
async function ingestRegulation(regulation: Regulation): Promise<IngestionResult> {
  const startTime = Date.now();

  try {
    // Determine which ingestion script to use
    const isUNECE = regulation.celexId.startsWith('42021X');
    const scriptName = isUNECE ? 'ingest-unece.ts' : 'ingest-eurlex.ts';
    const scriptPath = join(process.cwd(), 'scripts', scriptName);

    // SECURITY: Using execFile (not exec) to prevent command injection
    const args = ['tsx', scriptPath, regulation.celexId, regulation.filepath];

    // Add --browser flag for EUR-Lex regulations to bypass WAF
    if (!isUNECE) {
      args.push('--browser');
    }

    const { stdout, stderr } = await execFileAsync(
      'npx',
      args,
      {
        timeout: TIMEOUT_MS,
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      }
    );

    const duration = Date.now() - startTime;

    // Log any warnings from stderr
    if (stderr) {
      console.log(`  [stderr] ${stderr.trim()}`);
    }

    return {
      regulation: regulation.filename,
      success: true,
      duration,
    };
  } catch (err: any) {
    const duration = Date.now() - startTime;

    return {
      regulation: regulation.filename,
      success: false,
      error: err.message || String(err),
      duration,
    };
  }
}

/**
 * Process regulations in batches with rate limiting
 */
async function processBatches(regulations: Regulation[]): Promise<IngestionResult[]> {
  const results: IngestionResult[] = [];
  const totalBatches = Math.ceil(regulations.length / BATCH_SIZE);

  for (let i = 0; i < regulations.length; i += BATCH_SIZE) {
    const batch = regulations.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} regulations)`);
    console.log('─'.repeat(60));

    // Process batch in parallel
    const batchPromises = batch.map(async (reg, idx) => {
      const regNum = i + idx + 1;
      console.log(`[${regNum}/${regulations.length}] Starting: ${reg.filename} (${reg.celexId})`);

      const result = await ingestRegulation(reg);

      if (result.success) {
        console.log(`[${regNum}/${regulations.length}] ✅ ${reg.filename} (${result.duration}ms)`);
      } else {
        console.log(`[${regNum}/${regulations.length}] ❌ ${reg.filename}: ${result.error}`);
      }

      return result;
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Rate limiting: delay between batches (except after last batch)
    if (i + BATCH_SIZE < regulations.length) {
      console.log(`\n⏸️  Waiting ${BATCH_DELAY_MS}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/**
 * Print summary report
 */
function printSummary(results: IngestionResult[]) {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 INGESTION SUMMARY');
  console.log('═'.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);

  if (successful.length > 0) {
    const totalDuration = successful.reduce((sum, r) => sum + (r.duration || 0), 0);
    const avgDuration = totalDuration / successful.length;
    console.log(`⏱️  Average duration: ${Math.round(avgDuration)}ms`);
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed regulations:');
    for (const result of failed) {
      console.log(`  - ${result.regulation}: ${result.error}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
}

/**
 * Rebuild database and verify recitals
 */
async function rebuildDatabase() {
  console.log('\n🔨 Rebuilding database...');

  try {
    const { stdout } = await execFileAsync('npm', ['run', 'build:db'], {
      cwd: process.cwd(),
      timeout: 60000, // 1 minute timeout
    });

    console.log(stdout);
    console.log('✅ Database rebuilt successfully');
  } catch (err: any) {
    console.error('❌ Database rebuild failed:', err.message);
    throw err;
  }
}

/**
 * Query and display recital counts
 */
async function verifyRecitals() {
  console.log('\n📊 Verifying recital counts...');

  try {
    const { stdout } = await execFileAsync(
      'sqlite3',
      [
        'data/regulations.db',
        'SELECT regulation, COUNT(*) as recital_count FROM recitals GROUP BY regulation ORDER BY recital_count DESC LIMIT 10;',
      ],
      { cwd: process.cwd() }
    );

    console.log('\nTop 10 regulations by recital count:');
    console.log(stdout);

    // Get total count
    const { stdout: totalStdout } = await execFileAsync(
      'sqlite3',
      ['data/regulations.db', 'SELECT COUNT(*) FROM recitals;'],
      { cwd: process.cwd() }
    );

    const totalRecitals = parseInt(totalStdout.trim());
    console.log(`\n📈 Total recitals in database: ${totalRecitals}`);

    if (totalRecitals < 2000) {
      console.warn(`⚠️  Warning: Expected ~2,500+ recitals, got ${totalRecitals}`);
    } else {
      console.log('✅ Recital count looks good!');
    }
  } catch (err: any) {
    console.error('❌ Verification failed:', err.message);
  }
}

/**
 * Main execution
 */
async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('🚀 EU Regulations Bulk Re-Ingestion');
  console.log('═'.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Batch size: ${BATCH_SIZE} parallel instances`);
  console.log(`Batch delay: ${BATCH_DELAY_MS}ms`);
  console.log(`Timeout per regulation: ${TIMEOUT_MS}ms`);
  console.log('═'.repeat(60));

  // Step 1: Discover regulations
  console.log('\n🔍 Discovering regulations...');
  const regulations = await discoverRegulations();
  console.log(`Found ${regulations.length} regulations in data/seed/`);

  if (regulations.length === 0) {
    console.error('❌ No regulations found. Exiting.');
    process.exit(1);
  }

  // List regulations
  console.log('\nRegulations to process:');
  for (const reg of regulations) {
    const type = reg.celexId.startsWith('42021X') ? '[UNECE]' : '[EUR-Lex]';
    console.log(`  ${type} ${reg.filename} (${reg.celexId})`);
  }

  if (isDryRun) {
    console.log('\n✅ Dry run complete. No ingestion performed.');
    return;
  }

  // Confirm before starting
  console.log('\n⚠️  This will re-ingest all regulations using browser automation.');
  console.log(`⏱️  Estimated time: ${Math.ceil((regulations.length / BATCH_SIZE) * (BATCH_DELAY_MS / 1000))} seconds + ingestion time`);

  // Step 2: Process batches
  const results = await processBatches(regulations);

  // Step 3: Print summary
  printSummary(results);

  // Step 4: Rebuild database
  if (results.some(r => r.success)) {
    await rebuildDatabase();

    // Step 5: Verify recitals
    await verifyRecitals();
  } else {
    console.error('\n❌ No successful ingestions. Skipping database rebuild.');
  }

  // Exit with appropriate code
  const hasFailures = results.some(r => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

// Run main
main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
