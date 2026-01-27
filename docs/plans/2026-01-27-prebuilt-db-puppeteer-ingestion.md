# Pre-Built Database + Puppeteer Ingestion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship pre-built database with npm package, enable maintainers to use Puppeteer for recitals ingestion

**Architecture:**
- Commit complete `regulations.db` to git (not gitignored)
- Ship database in npm package (users never rebuild)
- Add Puppeteer-based ingestion for maintainers only
- One-time bulk re-ingestion to populate all 2,500+ recitals

**Tech Stack:** TypeScript, Puppeteer, SQLite, better-sqlite3

---

## Task 1: Update .gitignore to Track Database

**Files:**
- Modify: `.gitignore:4`

**Step 1: Remove database from .gitignore**

Edit `.gitignore` to comment out or remove the line that excludes the database:

```diff
 # Build output
 dist/

-# Database (built from seed)
-data/regulations.db
+# Database now committed (shipped with package)
+# data/regulations.db
```

**Step 2: Verify database is tracked**

Run: `git status`

Expected: `data/regulations.db` appears in untracked or modified files

**Step 3: Commit the change**

```bash
git add .gitignore
git commit -m "chore: track regulations.db in git for pre-built distribution"
```

---

## Task 2: Update package.json Build Scripts

**Files:**
- Modify: `package.json:19-20`

**Step 1: Remove postinstall hook**

The `postinstall` hook tries to rebuild the database on user machines, which will fail due to WAF. Remove it:

```diff
   "scripts": {
     "build": "tsc",
     "test": "vitest run",
     "test:watch": "vitest",
     "dev": "tsx src/index.ts",
     "dev:http": "tsx src/http-server.ts",
     "start": "node dist/index.js",
     "start:http": "node dist/http-server.js",
     "build:db": "tsx scripts/build-db.ts",
     "ingest": "tsx scripts/ingest-eurlex.ts",
     "check-updates": "tsx scripts/check-updates.ts",
     "sync-versions": "tsx scripts/check-updates.ts --sync",
     "lint": "eslint src --ext .ts",
-    "prepublishOnly": "npm run build && npm run build:db",
-    "postinstall": "(test -f dist/index.js || npm run build) && (test -f data/regulations.db || npm run build:db)"
+    "prepublishOnly": "npm run build"
   },
```

**Step 2: Add maintainer-only scripts**

Add new scripts for maintainer ingestion workflow:

```diff
     "sync-versions": "tsx scripts/check-updates.ts --sync",
+    "ingest:with-browser": "tsx scripts/ingest-eurlex-browser.ts",
+    "reingest:all": "tsx scripts/bulk-reingest-all.ts",
     "lint": "eslint src --ext .ts",
     "prepublishOnly": "npm run build"
```

**Step 3: Verify package.json is valid JSON**

Run: `npm run build`

Expected: No errors, TypeScript compiles successfully

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: remove postinstall hook, ship pre-built database"
```

---

## Task 3: Install Puppeteer as Dev Dependency

**Files:**
- Modify: `package.json:58-64` (devDependencies)

**Step 1: Install Puppeteer**

Run: `npm install --save-dev puppeteer`

Expected: Puppeteer ~23.x installed, package.json updated

**Step 2: Verify installation**

Run: `npx puppeteer --version`

Expected: Version number printed (e.g., "23.9.0")

**Step 3: Test Puppeteer can launch**

Run: `node -e "import('puppeteer').then(p => p.default.launch().then(b => b.close()))"`

Expected: Browser launches and closes without error

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add puppeteer for EUR-Lex WAF bypass"
```

---

## Task 4: Create Puppeteer-Based EUR-Lex Fetcher

**Files:**
- Create: `scripts/ingest-eurlex-browser.ts`

**Step 1: Write the failing test**

Create test file:

```typescript
// tests/scripts/eurlex-browser.test.ts
import { describe, it, expect } from 'vitest';
import { fetchEurLexWithBrowser } from '../../scripts/ingest-eurlex-browser';

describe('fetchEurLexWithBrowser', () => {
  it('should fetch GDPR HTML and bypass WAF', async () => {
    const html = await fetchEurLexWithBrowser('32016R0679');

    expect(html.length).toBeGreaterThan(100000); // Real HTML, not 2036 byte WAF challenge
    expect(html).toContain('Article'); // Contains regulation content
    expect(html).not.toContain('window.gokuProps'); // Not WAF challenge
  }, 60000); // 60s timeout for browser launch
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/scripts/eurlex-browser.test.ts`

Expected: FAIL - "Cannot find module '../../scripts/ingest-eurlex-browser'"

**Step 3: Write minimal implementation**

Create `scripts/ingest-eurlex-browser.ts`:

```typescript
#!/usr/bin/env npx tsx

/**
 * EUR-Lex fetcher using Puppeteer to bypass AWS WAF JavaScript challenge.
 * For maintainer use only - not needed by end users.
 */

import puppeteer from 'puppeteer';

export async function fetchEurLexWithBrowser(celexId: string): Promise<string> {
  console.log(`Launching browser for CELEX:${celexId}...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Set realistic User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celexId}`;
    console.log(`Navigating to: ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for content to load (WAF challenge takes ~3-5 seconds)
    await page.waitForSelector('body', { timeout: 30000 });

    // Extra wait to ensure JavaScript challenge completes
    await page.waitForTimeout(5000);

    const html = await page.content();
    console.log(`Fetched ${html.length} bytes`);

    return html;
  } finally {
    await browser.close();
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, celexId, outputPath] = process.argv;

  if (!celexId || !outputPath) {
    console.error('Usage: tsx scripts/ingest-eurlex-browser.ts <celex_id> <output_file>');
    process.exit(1);
  }

  fetchEurLexWithBrowser(celexId)
    .then(html => {
      const fs = require('fs');
      fs.writeFileSync(outputPath, html);
      console.log(`Saved to: ${outputPath}`);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/scripts/eurlex-browser.test.ts`

Expected: PASS - Puppeteer fetches real HTML, test verifies size and content

**Step 5: Commit**

```bash
git add scripts/ingest-eurlex-browser.ts tests/scripts/eurlex-browser.test.ts
git commit -m "feat: add puppeteer-based EUR-Lex fetcher to bypass WAF"
```

---

## Task 5: Integrate Browser Fetcher into Existing Ingestion Script

**Files:**
- Modify: `scripts/ingest-eurlex.ts:71-80`

**Step 1: Add conditional import at top of file**

```typescript
import { fetchEurLexWithBrowser } from './ingest-eurlex-browser.js';
```

**Step 2: Update fetchEurLexHtml to use browser when available**

Replace the existing `fetchEurLexHtml` function:

```typescript
async function fetchEurLexHtml(celexId: string, useBrowser = false): Promise<string> {
  if (useBrowser) {
    console.log('Using Puppeteer to bypass WAF...');
    return fetchEurLexWithBrowser(celexId);
  }

  // Fallback to direct fetch (will fail with WAF)
  const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celexId}`;
  console.log(`Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EU-Compliance-MCP/1.0; +https://github.com/Ansvar-Systems/EU_compliance_MCP)',
      'Accept': 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  return response.text();
}
```

**Step 3: Update CLI to accept --browser flag**

Replace the main section at bottom:

```typescript
// Main
const [,, celexId, outputPath, ...flags] = process.argv;
const useBrowser = flags.includes('--browser');

if (!celexId || !outputPath) {
  console.log('Usage: npx tsx scripts/ingest-eurlex.ts <celex_id> <output_file> [--browser]');
  console.log('Example: npx tsx scripts/ingest-eurlex.ts 32016R0679 data/seed/gdpr.json --browser');
  console.log('\nOptions:');
  console.log('  --browser   Use Puppeteer to bypass EUR-Lex WAF (required as of 2026-01-27)');
  console.log('\nKnown CELEX IDs:');
  Object.entries(REGULATION_METADATA).forEach(([id, meta]) => {
    console.log(`  ${id} - ${meta.id} (${meta.full_name})`);
  });
  process.exit(1);
}

ingestRegulation(celexId, outputPath, useBrowser).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
```

**Step 4: Update ingestRegulation signature**

```typescript
async function ingestRegulation(celexId: string, outputPath: string, useBrowser = false): Promise<void> {
  const metadata = REGULATION_METADATA[celexId];
  if (!metadata) {
    console.warn(`Unknown CELEX ID: ${celexId}. Using generic metadata.`);
  }

  const html = await fetchEurLexHtml(celexId, useBrowser);
  console.log(`Fetched ${html.length} bytes`);

  // ... rest of function unchanged
}
```

**Step 5: Test with --browser flag**

Run: `npx tsx scripts/ingest-eurlex.ts 32016R0679 /tmp/test-gdpr.json --browser`

Expected: Puppeteer launches, fetches HTML, parses ~173 recitals and articles

**Step 6: Commit**

```bash
git add scripts/ingest-eurlex.ts
git commit -m "feat: add --browser flag to ingestion script for WAF bypass"
```

---

## Task 6: Create Bulk Re-Ingestion Script

**Files:**
- Create: `scripts/bulk-reingest-all.ts`

**Step 1: Create parallel ingestion orchestrator**

```typescript
#!/usr/bin/env npx tsx

/**
 * Bulk re-ingest all 37 regulations using Puppeteer.
 * Runs ingestion in parallel batches to maximize throughput.
 *
 * Usage: npm run reingest:all
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SEED_DIR = join(process.cwd(), 'data', 'seed');
const BATCH_SIZE = 3; // Parallel browser instances
const DELAY_MS = 2000; // Delay between batches to avoid rate limiting

interface RegulationFile {
  path: string;
  celexId: string;
}

function extractCelexId(jsonPath: string): string | null {
  try {
    const content = require(jsonPath);
    return content.celex_id || null;
  } catch {
    return null;
  }
}

function findRegulationFiles(): RegulationFile[] {
  const files = readdirSync(SEED_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('mappings'));

  return files
    .map(file => ({
      path: join(SEED_DIR, file),
      celexId: extractCelexId(join(SEED_DIR, file)),
    }))
    .filter((r): r is RegulationFile => r.celexId !== null);
}

async function reingestOne(celexId: string, outputPath: string): Promise<void> {
  console.log(`\n[${celexId}] Starting ingestion...`);

  try {
    const { stdout, stderr } = await execFileAsync(
      'npx',
      ['tsx', 'scripts/ingest-eurlex.ts', celexId, outputPath, '--browser'],
      { timeout: 120000 }
    );

    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

    console.log(`[${celexId}] ✅ Complete`);
  } catch (err: any) {
    console.error(`[${celexId}] ❌ Failed:`, err.message);
    throw err;
  }
}

async function reingestBatch(batch: RegulationFile[]): Promise<void> {
  await Promise.all(
    batch.map(reg => reingestOne(reg.celexId, reg.path))
  );
}

async function main() {
  console.log('🚀 Bulk re-ingestion starting...\n');
  console.log('Using Puppeteer to bypass EUR-Lex WAF');
  console.log(`Batch size: ${BATCH_SIZE} parallel`);
  console.log(`Delay between batches: ${DELAY_MS}ms\n`);

  const regulations = findRegulationFiles();
  console.log(`Found ${regulations.length} regulations to re-ingest\n`);

  let completed = 0;
  const failed: string[] = [];

  for (let i = 0; i < regulations.length; i += BATCH_SIZE) {
    const batch = regulations.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(regulations.length / BATCH_SIZE);

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.map(r => r.celexId).join(', ')})`);

    try {
      await reingestBatch(batch);
      completed += batch.length;
    } catch (err) {
      failed.push(...batch.map(r => r.celexId));
    }

    console.log(`\n✅ Progress: ${completed}/${regulations.length}`);

    // Delay before next batch
    if (i + BATCH_SIZE < regulations.length) {
      console.log(`⏳ Waiting ${DELAY_MS}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log('\n\n🎉 Bulk re-ingestion complete!');
  console.log(`✅ Succeeded: ${completed}/${regulations.length}`);

  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`Failed regulations: ${failed.join(', ')}`);
    process.exit(1);
  }

  console.log('\n📊 Next steps:');
  console.log('  1. npm run build:db   # Rebuild database');
  console.log('  2. npm test           # Verify all tests pass');
  console.log('  3. git add data/      # Stage updated JSON files');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

**Step 2: Make script executable**

Run: `chmod +x scripts/bulk-reingest-all.ts`

**Step 3: Test with dry run (optional - can skip to save time)**

Add a `--dry-run` flag to print what would be done without executing.

**Step 4: Commit**

```bash
git add scripts/bulk-reingest-all.ts
git commit -m "feat: add bulk re-ingestion script for all 37 regulations"
```

---

## Task 7: Run Bulk Re-Ingestion (MAINTAINER ONLY)

**Files:**
- Modify: All `data/seed/*.json` files (37 files)

**Step 1: Backup current seed files**

Run: `cp -r data/seed data/seed.backup`

Expected: Backup created in `data/seed.backup/`

**Step 2: Run bulk re-ingestion**

Run: `npm run reingest:all`

Expected:
- Puppeteer launches for each regulation
- 37 regulations re-ingested with recitals
- Progress updates every batch
- Final success message

**Time estimate:** 20-40 minutes for 37 regulations (depends on network/EUR-Lex speed)

**Step 3: Verify recitals were extracted**

Run: `grep -r '"recitals":' data/seed/*.json | wc -l`

Expected: 37 (one per regulation file)

Run: `grep -r '"recital_number":' data/seed/*.json | wc -l`

Expected: ~2,500+ (total recitals across all regulations)

**Step 4: Rebuild database with new data**

Run: `npm run build:db`

Expected: Database rebuilt with all recitals

**Step 5: Verify database contains recitals**

Run: `sqlite3 data/regulations.db "SELECT COUNT(*) FROM recitals;"`

Expected: ~2,500 (not just 173)

Run: `sqlite3 data/regulations.db "SELECT regulation, COUNT(*) FROM recitals GROUP BY regulation;" | head -10`

Expected: Multiple regulations listed with counts (not just GDPR)

**Step 6: Run all tests**

Run: `npm test`

Expected: All tests pass with real data

**Step 7: Commit all updated seed files and database**

```bash
git add data/seed/*.json data/regulations.db
git commit -m "feat: bulk re-ingest all 37 regulations with recitals (~2,500+ total)"
```

---

## Task 8: Update Documentation to Reflect Pre-Built Model

**Files:**
- Modify: `README.md:95-110`
- Modify: `CLAUDE.md:30-50`

**Step 1: Update README installation section**

Find the "Installation" section and update:

```markdown
## Installation

### For Users (Recommended)

Install the package - it comes with a pre-built database:

\`\`\`bash
npm install @ansvar/eu-regulations-mcp
\`\`\`

The database includes:
- ✅ 37 EU regulations (2,278 articles)
- ✅ ~2,500+ recitals with legislative intent
- ✅ 1,145 definitions
- ✅ ISO 27001:2022 & NIST CSF 2.0 mappings

**No build step needed** - the package ships with a complete database.

### For Maintainers/Contributors

If you need to re-ingest regulations (e.g., after EUR-Lex updates):

\`\`\`bash
git clone https://github.com/Ansvar-Systems/EU_compliance_MCP.git
cd EU_compliance_MCP
npm install
npm run reingest:all  # Uses Puppeteer to bypass EUR-Lex WAF
npm run build:db      # Rebuild database from updated JSON
npm test              # Verify everything works
\`\`\`
```

**Step 2: Update CLAUDE.md with new workflow**

Update the "Adding New Regulations" section:

```markdown
## Adding New Regulations

### For End Users

❌ **Not supported** - the package ships with a pre-built database. Users cannot add regulations.

### For Maintainers

Adding a regulation requires Puppeteer (to bypass EUR-Lex WAF):

\`\`\`bash
# 1. Ingest from EUR-Lex with browser
npx tsx scripts/ingest-eurlex.ts <CELEX_ID> data/seed/<name>.json --browser

# 2. Rebuild database
npm run build:db

# 3. Test
npm test

# 4. Commit both JSON and database
git add data/seed/<name>.json data/regulations.db
git commit -m "feat: add <regulation_name>"
\`\`\`

The `--browser` flag is **required** as of 2026-01-27 due to EUR-Lex AWS WAF.

### Bulk Re-Ingestion

To re-ingest all 37 regulations (e.g., after EUR-Lex updates):

\`\`\`bash
npm run reingest:all  # Uses Puppeteer, takes 20-40 minutes
npm run build:db
npm test
\`\`\`
```

**Step 3: Update database build section in CLAUDE.md**

```markdown
## Database Build Process

The database (`data/regulations.db`) is **committed to git** and **shipped with the npm package**.

### Maintainer Build Process

1. Ingest regulations from EUR-Lex (with Puppeteer to bypass WAF)
2. Run `npm run build:db` to rebuild SQLite database
3. Commit both JSON seed files and database to git
4. Publish to npm with pre-built database

### Why Pre-Built?

- ✅ Users avoid EUR-Lex WAF blocking
- ✅ Zero setup complexity
- ✅ Instant installation
- ❌ Larger package size (~5-10MB)
- ❌ Users can't customize database

This trade-off prioritizes user experience over package size.
```

**Step 4: Commit documentation**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update for pre-built database architecture"
```

---

## Task 9: Update COVERAGE_GAPS.md with Accurate Status

**Files:**
- Modify: `docs/COVERAGE_GAPS.md:1-20`

**Step 1: Update recitals coverage section**

Replace false claims with accurate status:

```markdown
## Current Coverage (v0.4.0)

✅ **What works:**
- 37 EU regulations with full text (2,278 articles)
- ~2,500+ recitals with legislative intent (all regulations)
- 1,145 definitions extracted from regulations
- ISO 27001:2022 control mappings (313 mappings)
- NIST CSF 2.0 control mappings (373 mappings)
- Full-text search via SQLite FTS5
- Pre-built database (no user build required)

⚠️ **Limitations:**
- Recitals ingestion requires Puppeteer (maintainer-only)
- EUR-Lex access blocked by AWS WAF (as of 2026-01-27)
- Users cannot rebuild database (pre-built only)
- Daily freshness monitoring disabled (blocked by WAF)
```

**Step 2: Add section explaining WAF resolution**

```markdown
## EUR-Lex WAF Resolution (v0.4.0)

**Problem (v0.3.0-v0.3.1):** EUR-Lex deployed AWS WAF blocking automated access

**Solution (v0.4.0):**
- Maintainers use Puppeteer to bypass WAF
- Pre-built database shipped with npm package
- Users never interact with EUR-Lex directly

**Trade-offs:**
- ✅ Users unaffected by WAF
- ✅ Instant installation
- ❌ Larger package size (~5-10MB vs ~500KB)
- ❌ Freshness depends on maintainer updates
```

**Step 3: Remove outdated WAF workaround section**

If there's a section about manual HTML downloads or workarounds, remove it:

```diff
-## CRITICAL: EUR-Lex WAF Blocking (2026-01-27)
-
-**Status:** All automated EUR-Lex ingestion blocked by AWS WAF
-
-**Workarounds:**
-1. Implement headless browser (Puppeteer/Playwright)
-2. Use official EUR-Lex API (if available)
-3. Manual HTML downloads + local ingestion
```

**Step 4: Commit**

```bash
git add docs/COVERAGE_GAPS.md
git commit -m "docs: update coverage gaps with v0.4.0 recitals status"
```

---

## Task 10: Add README Badge for Database Status

**Files:**
- Modify: `README.md:8-12` (badges section)

**Step 1: Add database status badge**

```markdown
[![npm version](https://badge.fury.io/js/@ansvar%2Feu-regulations-mcp.svg)](https://www.npmjs.com/package/@ansvar/eu-regulations-mcp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/COVERAGE_GAPS.md)
[![Recitals](https://img.shields.io/badge/recitals-2500%2B-blue)](docs/COVERAGE_GAPS.md)
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add database status badges"
```

---

## Task 11: Version Bump and Release

**Files:**
- Modify: `package.json:2` (version)

**Step 1: Write test for version check**

```typescript
// tests/version.test.ts
import { describe, it, expect } from 'vitest';
import packageJson from '../package.json';

describe('Version', () => {
  it('should be at least 0.4.0', () => {
    const version = packageJson.version;
    const [major, minor] = version.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(4); // 0.4.0+
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/version.test.ts`

Expected: FAIL - version is still 0.3.1

**Step 3: Bump version**

Run: `npm version minor -m "feat: v0.4.0 - pre-built database with complete recitals"`

Expected: Version bumped to 0.4.0, git tag created

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/version.test.ts`

Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`

Expected: All tests pass (50+)

**Step 6: Push with tags**

```bash
git push origin main --tags
```

Expected: v0.4.0 tag pushed, triggers GitHub Actions publish workflow

---

## Task 12: Verify npm Package Contents

**Files:**
- None (verification only)

**Step 1: Create test package**

Run: `npm pack`

Expected: Creates `ansvar-eu-regulations-mcp-0.4.0.tgz`

**Step 2: Extract and inspect**

```bash
tar -xzf ansvar-eu-regulations-mcp-0.4.0.tgz
ls -lh package/data/regulations.db
```

Expected: Database file present, size ~5-10MB

**Step 3: Check included files**

```bash
tar -tzf ansvar-eu-regulations-mcp-0.4.0.tgz | grep -E '(regulations.db|data/seed/.*\.json)' | head -20
```

Expected: Both database and JSON seed files included

**Step 4: Test package installs**

```bash
cd /tmp
npm install /path/to/ansvar-eu-regulations-mcp-0.4.0.tgz
ls -lh node_modules/@ansvar/eu-regulations-mcp/data/regulations.db
```

Expected: Database present, ready to use

**Step 5: Clean up**

```bash
rm -rf /tmp/node_modules
rm ansvar-eu-regulations-mcp-0.4.0.tgz
rm -rf package/
```

**Step 6: Document verification**

No commit needed - this is verification only.

---

## Task 13: Update TEST_QUERIES.md Examples

**Files:**
- Modify: `docs/TEST_QUERIES.md:40-60`

**Step 1: Update recitals section**

Remove "⚠️ Partial" warnings and add examples for all regulations:

```markdown
### Recitals & Legislative Intent

"What's GDPR Recital 83?" ✅
- Returns: Context about encryption and pseudonymization as security measures

"Show me AI Act Recital 1" ✅
- Returns: High-level policy objectives for AI regulation

"Get NIS2 Recital 2" ✅
- Returns: Scope and essential entities rationale

"What does DORA Recital 50 say?" ✅
- Returns: ICT third-party risk management context

"Search for 'proportionality' in recitals" ✅
- Returns: Recitals across regulations discussing proportionality principle
```

**Step 2: Add example showing recitals in search**

```markdown
### Combined Search (Articles + Recitals)

"Search for 'incident notification'" ✅
- Returns: Mix of articles (binding requirements) and recitals (legislative intent)
- Articles appear first, then relevant recitals
- Helpful for understanding both "what" and "why"
```

**Step 3: Commit**

```bash
git add docs/TEST_QUERIES.md
git commit -m "docs: update test queries with complete recitals coverage"
```

---

## Completion Checklist

After all tasks complete, verify:

- [ ] Database tracked in git (not gitignored)
- [ ] `data/regulations.db` present and ~5-10MB
- [ ] Puppeteer installed as dev dependency
- [ ] Bulk re-ingestion script works
- [ ] All 37 regulations have recitals in database
- [ ] `npm test` passes (50+ tests)
- [ ] Documentation updated (README, CLAUDE.md, COVERAGE_GAPS.md, TEST_QUERIES.md)
- [ ] Version bumped to 0.4.0
- [ ] Git tags pushed
- [ ] npm package verified to include database

---

## Post-Implementation: Daily Freshness Monitoring

**Status:** Blocked by EUR-Lex WAF (separate issue)

The daily freshness monitoring workflow (`.github/workflows/check-updates.yml`) will need similar Puppeteer integration in a future release. This is out of scope for v0.4.0.

**Future task:** Create `.github/workflows/check-updates-browser.yml` that uses Puppeteer in GitHub Actions.

---

## Rollback Plan

If something goes wrong:

```bash
# Restore .gitignore
git checkout HEAD~1 .gitignore

# Remove database from git
git rm --cached data/regulations.db
git commit -m "chore: revert to build-on-install model"

# Restore package.json
git checkout HEAD~1 package.json

# Remove Puppeteer
npm uninstall puppeteer
```
