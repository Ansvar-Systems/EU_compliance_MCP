# Coverage Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all 5 identified coverage gaps (recitals, delegated acts, amendment history, cross-references, national transpositions) to make EU Compliance MCP the definitive EUR-Lex alternative.

**Architecture:** Incremental phase-by-phase implementation. Each phase is independently deployable and adds value. Phases build on each other but can be paused between releases.

**Tech Stack:** TypeScript, better-sqlite3, FTS5, jsdom for parsing, EUR-Lex/ESA APIs

---

## Phase Dependencies

```
v0.3.0: Recitals (standalone)
         ↓
v0.4.0: Delegated Acts (requires recitals FTS architecture)
         ↓
v0.5.0: Amendment History (requires version storage patterns)
         ↓
v0.6.0: Cross-Reference Graphs (requires all content types)
         ↓
Post-v1.0: National Transpositions (community-driven)
```

---

# PHASE 1: Recitals (v0.3.0)

**Estimated Effort:** 2-3 days
**Complexity:** Low (same EUR-Lex source, similar parsing)
**Value:** High (immediate user impact)

## Overview

Add recitals extraction to existing EUR-Lex ingestion. Recitals are numbered paragraphs before Article 1 that explain legislative intent. Schema already has `articles.recitals` column but it's empty.

**Strategy:** Extract recitals during ingestion, store as comma-separated article references in existing column, create new FTS5 table for searchable recital text.

---

### Task 1.1: Add Recitals Table Schema

**Files:**
- Modify: `scripts/build-db.ts:20-150`

**Step 1: Add recitals table to schema**

Add after `source_registry` table definition (around line 150):

```typescript
-- Recitals table
CREATE TABLE IF NOT EXISTS recitals (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  recital_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  related_articles TEXT,
  UNIQUE(regulation, recital_number)
);

-- FTS5 virtual table for recital search
CREATE VIRTUAL TABLE IF NOT EXISTS recitals_fts USING fts5(
  regulation,
  recital_number,
  text,
  content='recitals',
  content_rowid='id'
);

-- FTS5 triggers for recitals
CREATE TRIGGER IF NOT EXISTS recitals_ai AFTER INSERT ON recitals BEGIN
  INSERT INTO recitals_fts(rowid, regulation, recital_number, text)
  VALUES (new.id, new.regulation, new.recital_number, new.text);
END;

CREATE TRIGGER IF NOT EXISTS recitals_ad AFTER DELETE ON recitals BEGIN
  INSERT INTO recitals_fts(recitals_fts, rowid, regulation, recital_number, text)
  VALUES('delete', old.id, old.regulation, old.recital_number, old.text);
END;

CREATE TRIGGER IF NOT EXISTS recitals_au AFTER UPDATE ON recitals BEGIN
  INSERT INTO recitals_fts(recitals_fts, rowid, regulation, recital_number, text)
  VALUES('delete', old.id, old.regulation, old.recital_number, old.text);
  INSERT INTO recitals_fts(rowid, regulation, recital_number, text)
  VALUES (new.id, new.regulation, new.recital_number, new.text);
END;
```

**Step 2: Run build:db to verify schema**

```bash
npm run build:db
```

Expected: "Database created" with no errors

**Step 3: Verify table exists**

```bash
sqlite3 data/regulations.db "SELECT name FROM sqlite_master WHERE type='table' AND name='recitals';"
```

Expected: `recitals`

**Step 4: Commit schema change**

```bash
git add scripts/build-db.ts
git commit -m "feat(db): add recitals table and FTS5 index"
```

---

### Task 1.2: Add Recital Types to Ingestion Script

**Files:**
- Modify: `scripts/ingest-eurlex.ts:13-34`

**Step 1: Add Recital interface**

After `Definition` interface (line 24):

```typescript
interface Recital {
  recital_number: number;
  text: string;
  related_articles?: string;
}
```

**Step 2: Add recitals to RegulationData interface**

Modify `RegulationData` interface (line 26):

```typescript
interface RegulationData {
  id: string;
  full_name: string;
  celex_id: string;
  effective_date?: string;
  eur_lex_url: string;
  articles: Article[];
  definitions: Definition[];
  recitals: Recital[];  // ADD THIS LINE
}
```

**Step 3: Commit type definitions**

```bash
git add scripts/ingest-eurlex.ts
git commit -m "feat(ingest): add Recital type definitions"
```

---

### Task 1.3: Implement Recital Parsing Logic

**Files:**
- Modify: `scripts/ingest-eurlex.ts:71-150`

**Step 1: Add parseRecitals function**

Add before `parseArticles` function (around line 71):

```typescript
function parseRecitals(html: string): Recital[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const recitals: Recital[] = [];
  const allText = doc.body?.textContent || '';
  const lines = allText.split('\n').map(l => l.trim()).filter(l => l);

  let inRecitalsSection = false;
  let currentRecital: { number: number; lines: string[] } | null = null;

  for (const line of lines) {
    // Detect start of recitals section
    if (line.match(/^Having regard to/i) || line.match(/^Whereas:/i)) {
      inRecitalsSection = true;
      continue;
    }

    // Detect end of recitals (usually "HAVE ADOPTED" or "Article 1")
    if (line.match(/^HAVE ADOPTED/i) || line.match(/^Article\s+1$/i)) {
      inRecitalsSection = false;
      if (currentRecital && currentRecital.lines.length > 0) {
        recitals.push({
          recital_number: currentRecital.number,
          text: currentRecital.lines.join('\n\n'),
        });
      }
      break;
    }

    if (!inRecitalsSection) continue;

    // Match recital number: "(1)", "(123)", etc.
    const recitalMatch = line.match(/^\((\d+)\)/);
    if (recitalMatch) {
      // Save previous recital
      if (currentRecital && currentRecital.lines.length > 0) {
        recitals.push({
          recital_number: currentRecital.number,
          text: currentRecital.lines.join('\n\n'),
        });
      }

      // Start new recital
      currentRecital = {
        number: parseInt(recitalMatch[1]),
        lines: [],
      };

      // Add remaining text after number
      const textAfterNumber = line.substring(recitalMatch[0].length).trim();
      if (textAfterNumber) {
        currentRecital.lines.push(textAfterNumber);
      }
      continue;
    }

    // Add line to current recital
    if (currentRecital && line.length > 0) {
      currentRecital.lines.push(line);
    }
  }

  // Don't forget the last recital
  if (currentRecital && currentRecital.lines.length > 0) {
    recitals.push({
      recital_number: currentRecital.number,
      text: currentRecital.lines.join('\n\n'),
    });
  }

  return recitals;
}
```

**Step 2: Integrate recitals into main ingestion function**

Find the `main()` function (around line 200) and modify:

```typescript
async function main() {
  // ... existing code ...

  const html = await fetchEurLexHtml(celexId);

  // Parse recitals BEFORE articles
  const recitals = parseRecitals(html);
  console.log(`Parsed ${recitals.length} recitals`);

  const { articles, definitions } = parseArticles(html, celexId);

  // ... existing code ...

  const data: RegulationData = {
    id: metadata.id,
    full_name: metadata.full_name,
    celex_id: celexId,
    effective_date: metadata.effective_date,
    eur_lex_url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celexId}`,
    articles,
    definitions,
    recitals,  // ADD THIS
  };

  // ... rest of function ...
}
```

**Step 3: Test recital parsing on GDPR**

```bash
npx tsx scripts/ingest-eurlex.ts 32016R0679 /tmp/gdpr-test.json
```

Expected: "Parsed 173 recitals"

**Step 4: Verify JSON output**

```bash
cat /tmp/gdpr-test.json | jq '.recitals | length'
```

Expected: `173`

```bash
cat /tmp/gdpr-test.json | jq '.recitals[0]'
```

Expected: First recital with `recital_number` and `text`

**Step 5: Commit recital parsing**

```bash
git add scripts/ingest-eurlex.ts
git commit -m "feat(ingest): add recital parsing from EUR-Lex HTML"
```

---

### Task 1.4: Update Database Build Script to Ingest Recitals

**Files:**
- Modify: `scripts/build-db.ts:200-350`

**Step 1: Add recitals ingestion after articles**

Find the articles ingestion loop (around line 250) and add after it:

```typescript
    // Ingest recitals
    if (data.recitals && data.recitals.length > 0) {
      const insertRecital = db.prepare(`
        INSERT INTO recitals (regulation, recital_number, text, related_articles)
        VALUES (?, ?, ?, ?)
      `);

      for (const recital of data.recitals) {
        insertRecital.run(
          data.id,
          recital.recital_number,
          recital.text,
          recital.related_articles || null
        );
      }

      console.log(`  Loaded ${data.recitals.length} recitals`);
    }
```

**Step 2: Rebuild database with recitals**

```bash
npm run build:db
```

Expected: For each regulation, see "Loaded N recitals"

**Step 3: Verify recitals in database**

```bash
sqlite3 data/regulations.db "SELECT COUNT(*) FROM recitals;"
```

Expected: Large number (GDPR alone has 173)

```bash
sqlite3 data/regulations.db "SELECT regulation, recital_number, substr(text, 1, 100) FROM recitals WHERE regulation='GDPR' LIMIT 3;"
```

Expected: GDPR recitals 1-3 with text

**Step 4: Test FTS5 search on recitals**

```bash
sqlite3 data/regulations.db "SELECT COUNT(*) FROM recitals_fts WHERE recitals_fts MATCH 'encryption';"
```

Expected: Number > 0 (recitals mentioning encryption)

**Step 5: Commit database builder changes**

```bash
git add scripts/build-db.ts
git commit -m "feat(db): ingest recitals from seed JSON files"
```

---

### Task 1.5: Create get_recital Tool

**Files:**
- Create: `src/tools/recital.ts`
- Modify: `src/index.ts:20-30` (add import)
- Modify: `src/index.ts:50-70` (register tool)
- Modify: `src/index.ts:150-180` (add handler)

**Step 1: Write failing test**

Create `tests/tools/recital.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { getRecital } from '../../src/tools/recital';

const db = new Database('data/regulations.db', { readonly: true });

describe('getRecital', () => {
  it('should retrieve a specific recital', () => {
    const result = getRecital(db, {
      regulation: 'GDPR',
      recital_number: 83,
    });

    expect(result).toBeDefined();
    expect(result.recital_number).toBe(83);
    expect(result.text).toContain('encryption');
  });

  it('should return null for non-existent recital', () => {
    const result = getRecital(db, {
      regulation: 'GDPR',
      recital_number: 9999,
    });

    expect(result).toBeNull();
  });

  it('should retrieve recital from different regulation', () => {
    const result = getRecital(db, {
      regulation: 'DORA',
      recital_number: 1,
    });

    expect(result).toBeDefined();
    expect(result.regulation).toBe('DORA');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/tools/recital.test.ts
```

Expected: FAIL - "Module not found: ../../src/tools/recital"

**Step 3: Implement getRecital tool**

Create `src/tools/recital.ts`:

```typescript
import type Database from 'better-sqlite3';

export interface GetRecitalInput {
  regulation: string;
  recital_number: number;
}

export interface Recital {
  regulation: string;
  recital_number: number;
  text: string;
  related_articles?: string;
}

export function getRecital(db: Database.Database, input: GetRecitalInput): Recital | null {
  const stmt = db.prepare(`
    SELECT
      regulation,
      recital_number,
      text,
      related_articles
    FROM recitals
    WHERE regulation = ? AND recital_number = ?
  `);

  const row = stmt.get(input.regulation, input.recital_number) as Recital | undefined;
  return row || null;
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/tools/recital.test.ts
```

Expected: PASS (3/3 tests)

**Step 5: Register tool in MCP server**

Modify `src/index.ts`:

Add import (around line 20):
```typescript
import { getRecital, type GetRecitalInput } from './tools/recital.js';
```

Add tool definition in `ListToolsRequestSchema` handler (around line 60):
```typescript
    {
      name: 'get_recital',
      description: 'Retrieve a specific recital explaining legislative intent behind regulation articles.',
      inputSchema: {
        type: 'object',
        properties: {
          regulation: {
            type: 'string',
            description: 'Regulation ID (e.g., "GDPR", "DORA", "AI_ACT")',
          },
          recital_number: {
            type: 'number',
            description: 'Recital number (e.g., 83 for GDPR Recital 83)',
          },
        },
        required: ['regulation', 'recital_number'],
      },
    },
```

Add case in `CallToolRequestSchema` handler (around line 180):
```typescript
      case 'get_recital': {
        const input = args as unknown as GetRecitalInput;
        const recital = getRecital(database, input);
        if (!recital) {
          return {
            content: [{ type: 'text', text: `Recital ${input.recital_number} not found in ${input.regulation}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(recital, null, 2) }],
        };
      }
```

**Step 6: Test MCP tool**

```bash
npm run dev
```

In another terminal, test via MCP inspector or Claude Desktop:
```
"Get GDPR Recital 83"
```

Expected: Returns recital text mentioning encryption, pseudonymization

**Step 7: Commit tool implementation**

```bash
git add src/tools/recital.ts tests/tools/recital.test.ts src/index.ts
git commit -m "feat(tools): add get_recital tool for legislative intent"
```

---

### Task 1.6: Enhance search_regulations to Include Recitals

**Files:**
- Modify: `src/tools/search.ts:20-80`

**Step 1: Add recitals to search query**

Modify `searchRegulations` function (around line 30):

```typescript
export async function searchRegulations(
  db: Database.Database,
  input: SearchInput
): Promise<SearchResult[]> {
  // ... existing code ...

  // Search in both articles and recitals
  const articlesQuery = `
    SELECT
      articles.regulation,
      articles.article_number,
      articles.title,
      snippet(articles_fts, 3, '<mark>', '</mark>', '...', 64) as snippet,
      'article' as type
    FROM articles_fts
    JOIN articles ON articles.rowid = articles_fts.rowid
    WHERE articles_fts MATCH ?
    ${regulationFilter}
    LIMIT ?
  `;

  const recitalsQuery = `
    SELECT
      recitals.regulation,
      recitals.recital_number as article_number,
      'Recital ' || recitals.recital_number as title,
      snippet(recitals_fts, 2, '<mark>', '</mark>', '...', 64) as snippet,
      'recital' as type
    FROM recitals_fts
    JOIN recitals ON recitals.id = recitals_fts.rowid
    WHERE recitals_fts MATCH ?
    ${regulationFilter}
    LIMIT ?
  `;

  // Execute both queries
  const articleResults = db.prepare(articlesQuery).all(query, limit) as any[];
  const recitalResults = db.prepare(recitalsQuery).all(query, limit) as any[];

  // Combine and interleave results
  const combined = [...articleResults, ...recitalResults]
    .sort((a, b) => {
      // Prioritize articles over recitals
      if (a.type === 'article' && b.type === 'recital') return -1;
      if (a.type === 'recital' && b.type === 'article') return 1;
      return 0;
    })
    .slice(0, limit);

  return combined.map(row => ({
    regulation: row.regulation,
    article_number: row.article_number,
    title: row.title,
    snippet: row.snippet,
    type: row.type,
  }));
}
```

**Step 2: Update SearchResult type**

Add `type` field to interface (line 15):

```typescript
interface SearchResult {
  regulation: string;
  article_number: string;
  title?: string;
  snippet: string;
  type?: 'article' | 'recital';  // ADD THIS
}
```

**Step 3: Update tests**

Modify `tests/tools/search.test.ts` to expect recital results:

```typescript
  it('should search across articles and recitals', () => {
    const results = searchRegulations(db, {
      query: 'encryption',
      limit: 20
    });

    const hasArticles = results.some(r => r.type === 'article');
    const hasRecitals = results.some(r => r.type === 'recital');

    expect(hasArticles).toBe(true);
    expect(hasRecitals).toBe(true);
  });
```

**Step 4: Run tests**

```bash
npm test -- tests/tools/search.test.ts
```

Expected: All tests pass including new recital test

**Step 5: Commit search enhancement**

```bash
git add src/tools/search.ts tests/tools/search.test.ts
git commit -m "feat(search): include recitals in full-text search results"
```

---

### Task 1.7: Re-ingest All Regulations with Recitals

**Files:**
- Modify: All `data/seed/*.json` files

**Step 1: Create bulk re-ingestion script**

Create `scripts/reingest-all-with-recitals.sh`:

```bash
#!/bin/bash

# Re-ingest all regulations to add recitals

REGULATIONS=(
  "32016R0679:gdpr"
  "32022L2555:nis2"
  "32022R2554:dora"
  "32024R1689:ai-act"
  "32024R2847:cra"
  "32019R0881:cybersecurity-act"
  # ... add all 37 regulations
)

for reg in "${REGULATIONS[@]}"; do
  IFS=':' read -r celex filename <<< "$reg"
  echo "Re-ingesting $filename (CELEX: $celex)"
  npx tsx scripts/ingest-eurlex.ts "$celex" "data/seed/${filename}.json"
done

echo "Re-building database..."
npm run build:db

echo "Done! Run 'npm test' to verify."
```

**Step 2: Make script executable**

```bash
chmod +x scripts/reingest-all-with-recitals.sh
```

**Step 3: Run re-ingestion**

```bash
./scripts/reingest-all-with-recitals.sh
```

Expected: Each regulation shows "Parsed N recitals"

**Step 4: Verify recital counts**

```bash
sqlite3 data/regulations.db "SELECT regulation, COUNT(*) as recital_count FROM recitals GROUP BY regulation ORDER BY recital_count DESC LIMIT 10;"
```

Expected: Top regulations with recital counts (AI Act should be highest ~180)

**Step 5: Commit updated seed files**

```bash
git add data/seed/*.json
git commit -m "data: re-ingest all regulations with recitals"
```

---

### Task 1.8: Update Documentation

**Files:**
- Modify: `README.md:190-210` (add get_recital tool)
- Modify: `TEST_QUERIES.md:30-50` (update recital queries to ✅)
- Modify: `COVERAGE_GAPS.md:17-43` (mark recitals as ✅)

**Step 1: Update README with new tool**

Add to "Available Tools" section:

```markdown
### `get_recital`
Retrieve legislative intent and interpretation guidance.

\`\`\`
"Get GDPR Recital 83"
→ Returns: Context for "appropriate technical measures"
  (encryption, pseudonymization, resilience)
\`\`\`

\`\`\`
"What does DORA Recital 50 say about incident classification?"
→ Returns: Guidance on major vs. significant incidents
\`\`\`
```

**Step 2: Update TEST_QUERIES.md**

Change from ❌ to ✅:

```markdown
## ✅ Queries That Work (Updated v0.3.0)

### Recitals & Legislative Intent

\`\`\`
"What's the legislative intent behind GDPR Article 32?"
"Get GDPR Recital 83"
"How should I interpret 'appropriate technical measures' in DORA?"
"What guidance does the AI Act give on proportionality?"
"Show me all recitals mentioning risk assessment"
\`\`\`
```

**Step 3: Update COVERAGE_GAPS.md**

Change status:

```markdown
### 1. Recitals ✅ (Completed in v0.3.0)

**Status:** ✅ Fully implemented

**What's included:**
- Recitals table with FTS5 search
- get_recital tool for specific lookups
- Integrated into search_regulations
- All 37 regulations re-ingested with recitals

**Total recitals:** ~2,500+ across all regulations
```

**Step 4: Commit documentation updates**

```bash
git add README.md TEST_QUERIES.md COVERAGE_GAPS.md
git commit -m "docs: update for v0.3.0 recitals feature"
```

---

### Task 1.9: Version Bump and Release

**Files:**
- Modify: `package.json:3`

**Step 1: Bump version to 0.3.0**

```bash
npm version minor -m "feat: v0.3.0 - add recitals support"
```

**Step 2: Push tag**

```bash
git push origin main --tags
```

Expected: GitHub Actions workflow triggers npm publish

**Step 3: Verify npm package**

Wait 2-3 minutes, then:

```bash
npm view @ansvar/eu-regulations-mcp version
```

Expected: `0.3.0`

**Step 4: Verify package size**

```bash
npm view @ansvar/eu-regulations-mcp dist.tarball
```

Download and check size (should be ~8-10 MB with recitals)

---

## PHASE 1 COMPLETE ✅

**Deliverables:**
- ✅ Recitals table with FTS5 search
- ✅ get_recital tool
- ✅ search_regulations includes recitals
- ✅ All 37 regulations re-ingested
- ✅ ~2,500+ recitals searchable
- ✅ Documentation updated
- ✅ v0.3.0 published to npm

**What users can now do:**
- "Get GDPR Recital 83" → encryption guidance
- "Search for proportionality guidance in AI Act recitals"
- "What's the legislative intent behind DORA Article 17?"

**Next: Phase 2 - Delegated Acts (v0.4.0)**

---

# PHASE 2: Delegated Acts & Technical Standards (v0.4.0)

**Estimated Effort:** 2-3 weeks
**Complexity:** High (multiple sources, different formats)
**Value:** High (practical implementation guidance)

## Overview

Add delegated acts, implementing acts, and regulatory technical standards (RTS/ITS) from ESAs. These specify HOW to comply with base regulation requirements.

**Challenge:** Multiple sources (EBA, EIOPA, ESMA, European Commission), different publication formats, often delayed after base regulation.

**Strategy:**
1. Create `delegated_acts` table
2. Build scrapers for each ESA website
3. Link to parent regulation articles
4. Create `get_delegated_act` tool
5. Start with DORA (most urgent, clear RTS from EBA)

---

### Task 2.1: Add Delegated Acts Schema

**Files:**
- Modify: `scripts/build-db.ts:150-200`

**Step 1: Add delegated_acts table**

Add after recitals schema:

```typescript
-- Delegated acts and technical standards
CREATE TABLE IF NOT EXISTS delegated_acts (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  act_type TEXT NOT NULL CHECK(act_type IN ('delegated_act', 'implementing_act', 'rts', 'its', 'harmonized_standard')),
  act_id TEXT NOT NULL,
  title TEXT NOT NULL,
  adoption_date TEXT,
  effective_date TEXT,
  source_url TEXT NOT NULL,
  issuing_authority TEXT,
  related_articles TEXT,
  content TEXT NOT NULL,
  UNIQUE(regulation, act_id)
);

-- FTS5 for delegated acts
CREATE VIRTUAL TABLE IF NOT EXISTS delegated_acts_fts USING fts5(
  regulation,
  act_type,
  title,
  content,
  content='delegated_acts',
  content_rowid='id'
);

-- FTS5 triggers
CREATE TRIGGER IF NOT EXISTS delegated_acts_ai AFTER INSERT ON delegated_acts BEGIN
  INSERT INTO delegated_acts_fts(rowid, regulation, act_type, title, content)
  VALUES (new.id, new.regulation, new.act_type, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS delegated_acts_ad AFTER DELETE ON delegated_acts BEGIN
  INSERT INTO delegated_acts_fts(delegated_acts_fts, rowid, regulation, act_type, title, content)
  VALUES('delete', old.id, old.regulation, old.act_type, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS delegated_acts_au AFTER UPDATE ON delegated_acts BEGIN
  INSERT INTO delegated_acts_fts(delegated_acts_fts, rowid, regulation, act_type, title, content)
  VALUES('delete', old.id, old.regulation, old.act_type, old.title, old.content);
  INSERT INTO delegated_acts_fts(rowid, regulation, act_type, title, content)
  VALUES (new.id, new.regulation, new.act_type, new.title, new.content);
END;
```

**Step 2: Rebuild database**

```bash
npm run build:db
```

**Step 3: Verify table**

```bash
sqlite3 data/regulations.db "PRAGMA table_info(delegated_acts);"
```

Expected: List of columns including act_type, issuing_authority

**Step 4: Commit schema**

```bash
git add scripts/build-db.ts
git commit -m "feat(db): add delegated_acts table for RTS/ITS"
```

---

### Task 2.2: Create EBA RTS Scraper for DORA

**Files:**
- Create: `scripts/ingest-eba-rts.ts`

**Step 1: Write scraper skeleton**

Create `scripts/ingest-eba-rts.ts`:

```typescript
#!/usr/bin/env npx tsx

/**
 * Ingest EBA Regulatory Technical Standards (RTS) for DORA.
 *
 * EBA DORA RTS: https://www.eba.europa.eu/regulation-and-policy/digital-operational-resilience-act-dora
 */

import { writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';

interface DelegatedAct {
  act_type: 'rts' | 'its';
  act_id: string;
  title: string;
  adoption_date?: string;
  effective_date?: string;
  source_url: string;
  issuing_authority: 'EBA' | 'EIOPA' | 'ESMA';
  related_articles: string[];
  content: string;
}

const DORA_RTS_URLS = {
  'EBA-RTS-2024-01': 'https://www.eba.europa.eu/regulation-and-policy/...',
  // Add known DORA RTS URLs
};

async function fetchEbaDocument(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EU-Compliance-MCP/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

function parseEbaRTS(html: string, actId: string): DelegatedAct {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Extract title
  const title = doc.querySelector('h1')?.textContent?.trim() || actId;

  // Extract content (main articles/sections)
  const content = doc.querySelector('.document-content')?.textContent?.trim() || '';

  // Extract dates
  const adoptionDate = doc.querySelector('.adoption-date')?.textContent?.trim();

  return {
    act_type: 'rts',
    act_id: actId,
    title,
    adoption_date: adoptionDate,
    source_url: DORA_RTS_URLS[actId as keyof typeof DORA_RTS_URLS],
    issuing_authority: 'EBA',
    related_articles: [], // TODO: Extract from document
    content,
  };
}

async function main() {
  const acts: DelegatedAct[] = [];

  for (const [actId, url] of Object.entries(DORA_RTS_URLS)) {
    console.log(`Fetching ${actId}...`);
    const html = await fetchEbaDocument(url);
    const act = parseEbaRTS(html, actId);
    acts.push(act);
  }

  // Save to JSON
  const outputFile = 'data/seed/delegated-acts/dora-eba-rts.json';
  writeFileSync(outputFile, JSON.stringify(acts, null, 2));
  console.log(`Saved ${acts.length} DORA RTS to ${outputFile}`);
}

main().catch(console.error);
```

**Step 2: Create data directory**

```bash
mkdir -p data/seed/delegated-acts
```

**Step 3: Test scraper (will fail until URLs are real)**

```bash
npx tsx scripts/ingest-eba-rts.ts
```

Expected: Error or empty result (no URLs yet)

**Step 4: Commit scraper skeleton**

```bash
git add scripts/ingest-eba-rts.ts
git commit -m "feat(ingest): add EBA RTS scraper skeleton for DORA"
```

---

### Task 2.3: Research and Document DORA RTS URLs

**Files:**
- Create: `docs/delegated-acts-inventory.md`

**Step 1: Document known DORA RTS**

Create `docs/delegated-acts-inventory.md`:

```markdown
# Delegated Acts Inventory

## DORA (Digital Operational Resilience Act)

### EBA Regulatory Technical Standards

| Act ID | Title | Status | URL | Related Articles |
|--------|-------|--------|-----|------------------|
| EBA/RTS/2024/01 | ICT risk management framework | Final | [EBA](https://www.eba.europa.eu/...) | Art 15, 16 |
| EBA/RTS/2024/02 | ICT incident classification | Final | [EBA](https://www.eba.europa.eu/...) | Art 18, 19, 20 |
| EBA/RTS/2024/03 | Third-party ICT risk monitoring | Draft | [EBA](https://www.eba.europa.eu/...) | Art 28, 30 |

### ESMA/EIOPA Joint RTS

| Act ID | Title | Status | URL | Related Articles |
|--------|-------|--------|-----|------------------|
| ESAs/RTS/2024/01 | Oversight framework for ICT third-party service providers | Final | [ESAs](https://www.esma.europa.eu/...) | Art 31, 32 |

**Research needed:**
- [ ] Verify all EBA RTS are published
- [ ] Check EIOPA website for insurance-specific RTS
- [ ] Check ESMA website for markets-specific RTS
```

**Step 2: Manual research**

Visit:
1. https://www.eba.europa.eu/regulation-and-policy/digital-operational-resilience-act-dora
2. Search for "RTS" and "ITS"
3. Document actual URLs

**Step 3: Update inventory with real URLs**

(This is manual research step - actual URLs depend on EBA website structure)

**Step 4: Commit inventory**

```bash
git add docs/delegated-acts-inventory.md
git commit -m "docs: add delegated acts inventory for DORA"
```

---

### Task 2.4: Implement get_delegated_act Tool

**Files:**
- Create: `src/tools/delegated-act.ts`
- Create: `tests/tools/delegated-act.test.ts`

**Step 1: Write failing test**

Create `tests/tools/delegated-act.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { getDelegatedAct, listDelegatedActs } from '../../src/tools/delegated-act';

const db = new Database('data/regulations.db', { readonly: true });

describe('getDelegatedAct', () => {
  it('should retrieve specific delegated act', () => {
    const result = getDelegatedAct(db, {
      regulation: 'DORA',
      act_id: 'EBA-RTS-2024-01',
    });

    expect(result).toBeDefined();
    expect(result.act_type).toBe('rts');
    expect(result.issuing_authority).toBe('EBA');
  });

  it('should list all delegated acts for regulation', () => {
    const results = listDelegatedActs(db, {
      regulation: 'DORA',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].regulation).toBe('DORA');
  });

  it('should filter by act type', () => {
    const results = listDelegatedActs(db, {
      regulation: 'DORA',
      act_type: 'rts',
    });

    expect(results.every(a => a.act_type === 'rts')).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

```bash
npm test -- tests/tools/delegated-act.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement tool**

Create `src/tools/delegated-act.ts`:

```typescript
import type Database from 'better-sqlite3';

export interface GetDelegatedActInput {
  regulation: string;
  act_id: string;
}

export interface ListDelegatedActsInput {
  regulation: string;
  act_type?: 'delegated_act' | 'implementing_act' | 'rts' | 'its' | 'harmonized_standard';
}

export interface DelegatedAct {
  regulation: string;
  act_type: string;
  act_id: string;
  title: string;
  adoption_date?: string;
  effective_date?: string;
  source_url: string;
  issuing_authority?: string;
  related_articles?: string;
  content: string;
}

export function getDelegatedAct(
  db: Database.Database,
  input: GetDelegatedActInput
): DelegatedAct | null {
  const stmt = db.prepare(`
    SELECT * FROM delegated_acts
    WHERE regulation = ? AND act_id = ?
  `);

  return stmt.get(input.regulation, input.act_id) as DelegatedAct | null;
}

export function listDelegatedActs(
  db: Database.Database,
  input: ListDelegatedActsInput
): DelegatedAct[] {
  let query = 'SELECT * FROM delegated_acts WHERE regulation = ?';
  const params: any[] = [input.regulation];

  if (input.act_type) {
    query += ' AND act_type = ?';
    params.push(input.act_type);
  }

  query += ' ORDER BY adoption_date DESC';

  const stmt = db.prepare(query);
  return stmt.all(...params) as DelegatedAct[];
}
```

**Step 4: Run tests (will pass after delegated acts are ingested)**

```bash
npm test -- tests/tools/delegated-act.test.ts
```

Expected: PASS (after data exists) or skip if no data

**Step 5: Register in MCP server**

(Same pattern as Task 1.5 Step 5 - add import, tool definition, handler case)

**Step 6: Commit tool**

```bash
git add src/tools/delegated-act.ts tests/tools/delegated-act.test.ts src/index.ts
git commit -m "feat(tools): add get_delegated_act tool for RTS/ITS"
```

---

### Task 2.5-2.9: Additional ESA Scrapers

(Repeat Task 2.2-2.4 for EIOPA, ESMA, and other regulations)

**Pattern:**
1. Research ESA website for relevant RTS/ITS
2. Create scraper script
3. Ingest to `data/seed/delegated-acts/`
4. Update build-db.ts to load delegated acts
5. Test tools

**Regulations to cover:**
- DORA (EBA, EIOPA, ESMA)
- AI Act (Commission implementing acts - TBD)
- NIS2 (Commission implementing acts)
- MiCA (EBA, ESMA)

**Note:** This is iterative - start with DORA, release v0.4.0, continue with others in v0.4.1+

---

## PHASE 2 TARGET DELIVERABLES (v0.4.0)

- ✅ delegated_acts table
- ✅ get_delegated_act and list_delegated_acts tools
- ✅ DORA RTS from EBA (5-10 acts)
- ⚠️ AI Act implementing acts (if available)
- ⚠️ NIS2 implementing acts (if available)
- ✅ Documentation updated

**Stretch goals for v0.4.1-0.4.5:**
- All DORA RTS/ITS from all ESAs
- MiCA technical standards
- Harmonized standards for CRA

---

# PHASE 3: Amendment History (v0.5.0)

**Estimated Effort:** 1-2 weeks
**Complexity:** Medium (version storage, diff algorithms)
**Value:** Medium (mainly for legal teams)

## Overview

Track regulation versions over time. Store historical snapshots when EUR-Lex publishes amendments. Generate diffs showing what changed.

**Strategy:**
1. Add `regulation_versions` table
2. Snapshot current version on first ingest
3. On update detection, snapshot old → ingest new → generate diff
4. Create `get_regulation_history` tool
5. Create `compare_versions` tool

---

### Task 3.1: Add Version History Schema

**Files:**
- Modify: `scripts/build-db.ts:200-250`

**Step 1: Add regulation_versions table**

```typescript
-- Historical versions of regulations
CREATE TABLE IF NOT EXISTS regulation_versions (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  version_date TEXT NOT NULL,
  celex_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  articles_json TEXT NOT NULL,
  definitions_json TEXT NOT NULL,
  recitals_json TEXT NOT NULL,
  change_summary TEXT,
  UNIQUE(regulation, version_date)
);

-- Version diffs
CREATE TABLE IF NOT EXISTS version_diffs (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  diff_type TEXT CHECK(diff_type IN ('article_added', 'article_removed', 'article_modified', 'definition_added', 'definition_removed', 'definition_modified')),
  item_id TEXT NOT NULL,
  old_content TEXT,
  new_content TEXT,
  change_date TEXT NOT NULL
);
```

**Step 2: Rebuild database**

```bash
npm run build:db
```

**Step 3: Verify tables**

```bash
sqlite3 data/regulations.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%version%';"
```

Expected: `regulation_versions`, `version_diffs`

**Step 4: Commit schema**

```bash
git add scripts/build-db.ts
git commit -m "feat(db): add version history tracking schema"
```

---

### Task 3.2: Create Version Snapshot Function

**Files:**
- Create: `scripts/snapshot-version.ts`

**Step 1: Implement snapshot script**

```typescript
#!/usr/bin/env npx tsx

/**
 * Create version snapshot of a regulation.
 * Run after each ingestion to track changes over time.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(__dirname, '..', 'data', 'regulations.db');

interface SnapshotInput {
  regulation: string;
  versionDate: string;  // EUR-Lex version date
  celexId: string;
}

function createSnapshot(db: Database.Database, input: SnapshotInput) {
  // Fetch current articles
  const articles = db.prepare(`
    SELECT * FROM articles WHERE regulation = ?
  `).all(input.regulation);

  // Fetch current definitions
  const definitions = db.prepare(`
    SELECT * FROM definitions WHERE regulation = ?
  `).all(input.regulation);

  // Fetch current recitals
  const recitals = db.prepare(`
    SELECT * FROM recitals WHERE regulation = ?
  `).all(input.regulation);

  // Insert snapshot
  const stmt = db.prepare(`
    INSERT INTO regulation_versions
    (regulation, version_date, celex_id, snapshot_date, articles_json, definitions_json, recitals_json)
    VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
  `);

  stmt.run(
    input.regulation,
    input.versionDate,
    input.celexId,
    JSON.stringify(articles),
    JSON.stringify(definitions),
    JSON.stringify(recitals)
  );

  console.log(`Created snapshot for ${input.regulation} version ${input.versionDate}`);
}

async function main() {
  const db = new Database(DB_PATH);

  const regulation = process.argv[2];
  const versionDate = process.argv[3];
  const celexId = process.argv[4];

  if (!regulation || !versionDate || !celexId) {
    console.error('Usage: npx tsx snapshot-version.ts <regulation> <version_date> <celex_id>');
    console.error('Example: npx tsx snapshot-version.ts GDPR 2018-05-25 32016R0679');
    process.exit(1);
  }

  createSnapshot(db, { regulation, versionDate, celexId });
}

main().catch(console.error);
```

**Step 2: Test snapshot creation**

```bash
npx tsx scripts/snapshot-version.ts GDPR 2018-05-25 32016R0679
```

Expected: "Created snapshot for GDPR version 2018-05-25"

**Step 3: Verify snapshot**

```bash
sqlite3 data/regulations.db "SELECT regulation, version_date, length(articles_json) FROM regulation_versions WHERE regulation='GDPR';"
```

Expected: One row with GDPR snapshot

**Step 4: Commit snapshot script**

```bash
git add scripts/snapshot-version.ts
git commit -m "feat(versions): add snapshot creation for version tracking"
```

---

### Task 3.3: Implement Diff Generation

**Files:**
- Create: `scripts/generate-diff.ts`

**Step 1: Implement diff algorithm**

```typescript
#!/usr/bin/env npx tsx

/**
 * Generate diff between two regulation versions.
 */

import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(__dirname, '..', 'data', 'regulations.db');

interface Article {
  article_number: string;
  title?: string;
  text: string;
}

function generateArticleDiffs(
  db: Database.Database,
  regulation: string,
  fromVersion: string,
  toVersion: string
) {
  // Fetch both versions
  const oldSnapshot = db.prepare(`
    SELECT articles_json FROM regulation_versions
    WHERE regulation = ? AND version_date = ?
  `).get(regulation, fromVersion) as { articles_json: string } | undefined;

  const newSnapshot = db.prepare(`
    SELECT articles_json FROM regulation_versions
    WHERE regulation = ? AND version_date = ?
  `).get(regulation, toVersion) as { articles_json: string } | undefined;

  if (!oldSnapshot || !newSnapshot) {
    throw new Error('Version not found');
  }

  const oldArticles = JSON.parse(oldSnapshot.articles_json) as Article[];
  const newArticles = JSON.parse(newSnapshot.articles_json) as Article[];

  const oldMap = new Map(oldArticles.map(a => [a.article_number, a]));
  const newMap = new Map(newArticles.map(a => [a.article_number, a]));

  const diffs: any[] = [];

  // Find added articles
  for (const [articleNum, article] of newMap) {
    if (!oldMap.has(articleNum)) {
      diffs.push({
        regulation,
        from_version: fromVersion,
        to_version: toVersion,
        diff_type: 'article_added',
        item_id: articleNum,
        old_content: null,
        new_content: article.text,
        change_date: toVersion,
      });
    }
  }

  // Find removed articles
  for (const [articleNum, article] of oldMap) {
    if (!newMap.has(articleNum)) {
      diffs.push({
        regulation,
        from_version: fromVersion,
        to_version: toVersion,
        diff_type: 'article_removed',
        item_id: articleNum,
        old_content: article.text,
        new_content: null,
        change_date: toVersion,
      });
    }
  }

  // Find modified articles
  for (const [articleNum, newArticle] of newMap) {
    const oldArticle = oldMap.get(articleNum);
    if (oldArticle && oldArticle.text !== newArticle.text) {
      diffs.push({
        regulation,
        from_version: fromVersion,
        to_version: toVersion,
        diff_type: 'article_modified',
        item_id: articleNum,
        old_content: oldArticle.text,
        new_content: newArticle.text,
        change_date: toVersion,
      });
    }
  }

  // Insert diffs
  const stmt = db.prepare(`
    INSERT INTO version_diffs
    (regulation, from_version, to_version, diff_type, item_id, old_content, new_content, change_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const diff of diffs) {
    stmt.run(
      diff.regulation,
      diff.from_version,
      diff.to_version,
      diff.diff_type,
      diff.item_id,
      diff.old_content,
      diff.new_content,
      diff.change_date
    );
  }

  console.log(`Generated ${diffs.length} diffs between ${fromVersion} and ${toVersion}`);
}

async function main() {
  const db = new Database(DB_PATH);

  const regulation = process.argv[2];
  const fromVersion = process.argv[3];
  const toVersion = process.argv[4];

  if (!regulation || !fromVersion || !toVersion) {
    console.error('Usage: npx tsx generate-diff.ts <regulation> <from_version> <to_version>');
    process.exit(1);
  }

  generateArticleDiffs(db, regulation, fromVersion, toVersion);
}

main().catch(console.error);
```

**Step 2: Test diff generation (manual - needs 2 versions)**

```bash
# First create two snapshots (simulate different versions)
npx tsx scripts/snapshot-version.ts GDPR 2018-05-25 32016R0679
# (Manually modify an article in seed file)
# Re-ingest and snapshot again
npx tsx scripts/snapshot-version.ts GDPR 2023-01-01 32016R0679
# Generate diff
npx tsx scripts/generate-diff.ts GDPR 2018-05-25 2023-01-01
```

Expected: "Generated N diffs"

**Step 3: Commit diff generator**

```bash
git add scripts/generate-diff.ts
git commit -m "feat(versions): add diff generation between versions"
```

---

### Task 3.4: Create Version History Tools

**Files:**
- Create: `src/tools/version-history.ts`
- Create: `tests/tools/version-history.test.ts`

**Step 1: Implement tools**

```typescript
import type Database from 'better-sqlite3';

export interface GetVersionHistoryInput {
  regulation: string;
}

export interface CompareVersionsInput {
  regulation: string;
  from_version: string;
  to_version: string;
}

export interface VersionInfo {
  regulation: string;
  version_date: string;
  celex_id: string;
  snapshot_date: string;
  change_summary?: string;
}

export interface VersionDiff {
  diff_type: string;
  item_id: string;
  old_content?: string;
  new_content?: string;
}

export function getVersionHistory(
  db: Database.Database,
  input: GetVersionHistoryInput
): VersionInfo[] {
  const stmt = db.prepare(`
    SELECT regulation, version_date, celex_id, snapshot_date, change_summary
    FROM regulation_versions
    WHERE regulation = ?
    ORDER BY version_date DESC
  `);

  return stmt.all(input.regulation) as VersionInfo[];
}

export function compareVersions(
  db: Database.Database,
  input: CompareVersionsInput
): VersionDiff[] {
  const stmt = db.prepare(`
    SELECT diff_type, item_id, old_content, new_content
    FROM version_diffs
    WHERE regulation = ? AND from_version = ? AND to_version = ?
    ORDER BY item_id
  `);

  return stmt.all(input.regulation, input.from_version, input.to_version) as VersionDiff[];
}
```

**Step 2: Write tests**

**Step 3: Register in MCP server**

**Step 4: Commit tools**

```bash
git add src/tools/version-history.ts tests/tools/version-history.test.ts src/index.ts
git commit -m "feat(tools): add version history and comparison tools"
```

---

### Task 3.5: Integrate with Update Detection

**Files:**
- Modify: `scripts/check-updates.ts:100-150`

**Step 1: Add snapshot on version change**

Modify update checker to create snapshot before re-ingesting:

```typescript
  // When version change detected:
  console.log(`Creating snapshot of old version...`);
  await createSnapshot(db, {
    regulation: regId,
    versionDate: oldVersion,
    celexId: celexId,
  });

  console.log(`Re-ingesting new version...`);
  await reingestRegulation(celexId);

  console.log(`Generating diffs...`);
  await generateDiffs(db, regId, oldVersion, newVersion);
```

**Step 2: Test full workflow**

(Requires actual version change detection - manual test)

**Step 3: Commit integration**

```bash
git add scripts/check-updates.ts
git commit -m "feat(updates): auto-snapshot and diff on version changes"
```

---

## PHASE 3 TARGET DELIVERABLES (v0.5.0)

- ✅ regulation_versions table
- ✅ version_diffs table
- ✅ Snapshot creation on ingestion
- ✅ Diff generation between versions
- ✅ get_version_history tool
- ✅ compare_versions tool
- ✅ Integration with update detection

---

# PHASE 4: Cross-Reference Graphs (v0.6.0)

**Estimated Effort:** 2-3 weeks
**Complexity:** High (NLP, graph algorithms)
**Value:** Medium (nice-to-have, mainly for legal researchers)

## Overview

Build dependency graph of regulations. Extract "Article 6 of Regulation (EU) 2016/679" mentions, create structured relationships.

**Strategy:**
1. Add `cross_references` table
2. Parse article text for citation patterns
3. Extract using regex + heuristics
4. Create graph traversal tools
5. Visualize dependencies

---

### Task 4.1: Add Cross-References Schema

**Files:**
- Modify: `scripts/build-db.ts:250-300`

**Step 1: Add cross_references table**

```typescript
-- Cross-references between regulations
CREATE TABLE IF NOT EXISTS cross_references (
  id INTEGER PRIMARY KEY,
  source_regulation TEXT NOT NULL,
  source_article TEXT NOT NULL,
  target_regulation TEXT,
  target_article TEXT,
  reference_text TEXT NOT NULL,
  reference_type TEXT CHECK(reference_type IN ('explicit', 'implicit', 'override')),
  FOREIGN KEY (source_regulation) REFERENCES regulations(id)
);

CREATE INDEX idx_cross_ref_source ON cross_references(source_regulation, source_article);
CREATE INDEX idx_cross_ref_target ON cross_references(target_regulation, target_article);
```

**Step 2: Rebuild database**

```bash
npm run build:db
```

**Step 3: Commit schema**

```bash
git add scripts/build-db.ts
git commit -m "feat(db): add cross_references table for dependency graph"
```

---

### Task 4.2: Extract Citations from Article Text

**Files:**
- Create: `scripts/extract-citations.ts`

**Step 1: Implement citation extraction**

```typescript
#!/usr/bin/env npx tsx

/**
 * Extract cross-references from article text using regex patterns.
 */

import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(__dirname, '..', 'data', 'regulations.db');

// Citation patterns
const PATTERNS = [
  // "Article 6 of Regulation (EU) 2016/679"
  /Article\s+(\d+[a-z]?)\s+of\s+Regulation\s+\(EU\)\s+(\d{4})\/(\d+)/gi,

  // "Directive (EU) 2022/2555, Article 23"
  /Directive\s+\(EU\)\s+(\d{4})\/(\d+),\s+Article\s+(\d+)/gi,

  // "GDPR Article 6"
  /(GDPR|DORA|NIS2)\s+Article\s+(\d+)/gi,

  // "Article 32(1) of this Regulation" (same regulation)
  /Article\s+(\d+[a-z]?)(?:\((\d+)\))?\s+of\s+this\s+Regulation/gi,
];

const CELEX_TO_ID: Record<string, string> = {
  '32016R0679': 'GDPR',
  '32022L2555': 'NIS2',
  '32022R2554': 'DORA',
  // ... add all regulations
};

function extractCitations(text: string, sourceRegulation: string): any[] {
  const citations: any[] = [];

  for (const pattern of PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // Parse based on pattern type
      let targetRegulation = sourceRegulation;
      let targetArticle = '';

      if (match[0].includes('of Regulation')) {
        const celex = `${match[2]}R${match[3]}`;
        targetRegulation = CELEX_TO_ID[celex] || celex;
        targetArticle = match[1];
      } else if (match[0].includes('GDPR') || match[0].includes('DORA')) {
        targetRegulation = match[1];
        targetArticle = match[2];
      } else if (match[0].includes('of this Regulation')) {
        targetArticle = match[1];
      }

      citations.push({
        target_regulation: targetRegulation,
        target_article: targetArticle,
        reference_text: match[0],
        reference_type: 'explicit',
      });
    }
  }

  return citations;
}

async function main() {
  const db = new Database(DB_PATH);

  // Get all articles
  const articles = db.prepare(`
    SELECT regulation, article_number, text FROM articles
  `).all() as Array<{ regulation: string; article_number: string; text: string }>;

  const insertStmt = db.prepare(`
    INSERT INTO cross_references
    (source_regulation, source_article, target_regulation, target_article, reference_text, reference_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let totalCitations = 0;

  for (const article of articles) {
    const citations = extractCitations(article.text, article.regulation);

    for (const citation of citations) {
      insertStmt.run(
        article.regulation,
        article.article_number,
        citation.target_regulation,
        citation.target_article,
        citation.reference_text,
        citation.reference_type
      );
      totalCitations++;
    }
  }

  console.log(`Extracted ${totalCitations} citations from ${articles.length} articles`);
}

main().catch(console.error);
```

**Step 2: Run citation extraction**

```bash
npx tsx scripts/extract-citations.ts
```

Expected: "Extracted N citations"

**Step 3: Verify citations**

```bash
sqlite3 data/regulations.db "SELECT source_regulation, source_article, target_regulation, target_article, reference_text FROM cross_references LIMIT 10;"
```

Expected: List of extracted citations

**Step 4: Commit extraction script**

```bash
git add scripts/extract-citations.ts
git commit -m "feat(citations): extract cross-references from article text"
```

---

### Task 4.3: Create Citation Query Tools

**Files:**
- Create: `src/tools/citations.ts`

**Step 1: Implement citation tools**

```typescript
import type Database from 'better-sqlite3';

export interface FindReferencesInput {
  regulation: string;
  article?: string;
}

export interface CrossReference {
  source_regulation: string;
  source_article: string;
  target_regulation: string;
  target_article: string;
  reference_text: string;
}

// Find what this article references
export function findOutgoingReferences(
  db: Database.Database,
  input: FindReferencesInput
): CrossReference[] {
  let query = `
    SELECT * FROM cross_references
    WHERE source_regulation = ?
  `;

  const params: any[] = [input.regulation];

  if (input.article) {
    query += ' AND source_article = ?';
    params.push(input.article);
  }

  return db.prepare(query).all(...params) as CrossReference[];
}

// Find what references this article
export function findIncomingReferences(
  db: Database.Database,
  input: FindReferencesInput
): CrossReference[] {
  let query = `
    SELECT * FROM cross_references
    WHERE target_regulation = ?
  `;

  const params: any[] = [input.regulation];

  if (input.article) {
    query += ' AND target_article = ?';
    params.push(input.article);
  }

  return db.prepare(query).all(...params) as CrossReference[];
}
```

**Step 2: Write tests**

**Step 3: Register in MCP**

**Step 4: Commit tools**

```bash
git add src/tools/citations.ts tests/tools/citations.test.ts src/index.ts
git commit -m "feat(tools): add citation query tools"
```

---

### Task 4.4: Generate Regulation Dependency Graph

**Files:**
- Create: `scripts/generate-dependency-graph.ts`

**Step 1: Generate GraphViz DOT file**

```typescript
#!/usr/bin/env npx tsx

/**
 * Generate dependency graph visualization.
 * Output: Graphviz DOT format
 */

import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(__dirname, '..', 'data', 'regulations.db');

function generateDOT(db: Database.Database): string {
  const regulations = db.prepare(`
    SELECT DISTINCT regulation FROM
      (SELECT source_regulation as regulation FROM cross_references
       UNION
       SELECT target_regulation as regulation FROM cross_references)
  `).all() as Array<{ regulation: string }>;

  const references = db.prepare(`
    SELECT source_regulation, target_regulation, COUNT(*) as count
    FROM cross_references
    WHERE source_regulation != target_regulation
    GROUP BY source_regulation, target_regulation
  `).all() as Array<{ source_regulation: string; target_regulation: string; count: number }>;

  let dot = 'digraph regulations {\n';
  dot += '  rankdir=LR;\n';
  dot += '  node [shape=box, style=rounded];\n\n';

  // Add nodes
  for (const reg of regulations) {
    dot += `  "${reg.regulation}";\n`;
  }

  dot += '\n';

  // Add edges
  for (const ref of references) {
    const weight = Math.min(ref.count / 5, 5);  // Normalize edge weight
    dot += `  "${ref.source_regulation}" -> "${ref.target_regulation}" [label="${ref.count}", penwidth=${weight}];\n`;
  }

  dot += '}\n';

  return dot;
}

async function main() {
  const db = new Database(DB_PATH);
  const dot = generateDOT(db);

  const outputFile = 'docs/regulation-dependency-graph.dot';
  writeFileSync(outputFile, dot);
  console.log(`Generated dependency graph: ${outputFile}`);
  console.log('Render with: dot -Tpng -o graph.png regulation-dependency-graph.dot');
}

main().catch(console.error);
```

**Step 2: Generate and render graph**

```bash
npx tsx scripts/generate-dependency-graph.ts
dot -Tpng -o docs/regulation-graph.png docs/regulation-dependency-graph.dot
```

**Step 3: Commit graph generation**

```bash
git add scripts/generate-dependency-graph.ts docs/regulation-dependency-graph.dot
git commit -m "feat(visualization): generate regulation dependency graph"
```

---

## PHASE 4 TARGET DELIVERABLES (v0.6.0)

- ✅ cross_references table
- ✅ Citation extraction from article text
- ✅ find_references tool (incoming/outgoing)
- ✅ Dependency graph visualization
- ✅ Documentation updated

---

# PHASE 5: National Transpositions (Post-v1.0)

**Estimated Effort:** Ongoing (community-driven)
**Complexity:** Very High (27 countries, multiple languages, different legal systems)
**Value:** High (for country-specific compliance)

## Overview

This phase is intentionally designed for **community contributions**. Each country is a separate project.

**Strategy:**
1. Create template for national transposition ingestion
2. Start with one country (Sweden) as example
3. Document process clearly
4. Let community contribute other countries

---

### Task 5.1: Design National Transposition Schema

**Files:**
- Modify: `scripts/build-db.ts:300-350`

**Step 1: Add national_transpositions table**

```typescript
-- National implementations of directives
CREATE TABLE IF NOT EXISTS national_transpositions (
  id INTEGER PRIMARY KEY,
  directive TEXT NOT NULL REFERENCES regulations(id),
  member_state TEXT NOT NULL,
  national_law_id TEXT NOT NULL,
  national_law_name TEXT NOT NULL,
  transposition_date TEXT,
  source_url TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  UNIQUE(directive, member_state)
);

-- Map directive articles to national provisions
CREATE TABLE IF NOT EXISTS transposition_mappings (
  id INTEGER PRIMARY KEY,
  transposition_id INTEGER REFERENCES national_transpositions(id),
  directive_article TEXT NOT NULL,
  national_provision TEXT NOT NULL,
  notes TEXT
);
```

**Step 2: Rebuild database**

```bash
npm run build:db
```

**Step 3: Commit schema**

```bash
git add scripts/build-db.ts
git commit -m "feat(db): add national transposition schema"
```

---

### Task 5.2: Create Transposition Template

**Files:**
- Create: `scripts/templates/ingest-national-transposition.ts`
- Create: `docs/CONTRIBUTING_NATIONAL_LAWS.md`

**Step 1: Create ingestion template**

```typescript
#!/usr/bin/env npx tsx

/**
 * Template for ingesting national transposition of EU directive.
 *
 * Copy this file and customize for your country.
 * Example: ingest-swedish-nis2.ts
 */

interface NationalTransposition {
  directive: string;  // e.g., 'NIS2'
  member_state: string;  // ISO 3166-1 alpha-2 code (e.g., 'SE')
  national_law_id: string;  // e.g., 'SFS 2024:123'
  national_law_name: string;
  transposition_date: string;
  source_url: string;  // Official source
  language: string;  // ISO 639-1 (e.g., 'sv')
  content: string;  // Full text in original language
}

async function fetchNationalLaw(url: string): Promise<string> {
  // TODO: Implement fetching from national legal database
  // Examples:
  // - Sweden: https://www.riksdagen.se/
  // - Germany: https://www.gesetze-im-internet.de/
  // - France: https://www.legifrance.gouv.fr/
  return '';
}

function parseNationalLaw(html: string): string {
  // TODO: Parse national law format
  return '';
}

async function main() {
  // TODO: Implement ingestion
  // 1. Fetch from national source
  // 2. Parse text
  // 3. Map to directive articles
  // 4. Save JSON to data/seed/national-laws/<country>-<directive>.json
}

main().catch(console.error);
```

**Step 2: Create contribution guide**

Create `docs/CONTRIBUTING_NATIONAL_LAWS.md`:

```markdown
# Contributing National Transpositions

Want to add your country's implementation of EU directives? Here's how.

## Pick a Directive + Country

Current priorities:
- NIS2 (all countries)
- ePrivacy (all countries)
- LED (all countries)

Check if someone else is working on it: [Issues tagged `national-transposition`](https://github.com/Ansvar-Systems/EU_compliance_MCP/labels/national-transposition)

## Steps

1. **Find the official source**
   - Must be from national government legal database
   - Examples:
     - 🇸🇪 Sweden: riksdagen.se
     - 🇩🇪 Germany: gesetze-im-internet.de
     - 🇫🇷 France: legifrance.gouv.fr

2. **Copy the template**
   ```bash
   cp scripts/templates/ingest-national-transposition.ts scripts/ingest-swedish-nis2.ts
   ```

3. **Implement the scraper**
   - Fetch from official source
   - Parse HTML/PDF to extract text
   - Map national provisions to directive articles

4. **Create JSON file**
   ```bash
   npx tsx scripts/ingest-swedish-nis2.ts
   ```
   Output: `data/seed/national-laws/se-nis2.json`

5. **Update build script**
   Modify `scripts/build-db.ts` to load your file

6. **Test**
   ```bash
   npm run build:db
   npm test
   ```

7. **Submit PR**
   - Include source URL in PR description
   - Tag with `national-transposition`
   - Add language note if not English

## Translation

National laws in original language are preferred (authoritative). English translations are nice-to-have but optional.

## Questions?

Open an issue or discuss in #national-laws channel.
```

**Step 3: Commit template**

```bash
git add scripts/templates/ingest-national-transposition.ts docs/CONTRIBUTING_NATIONAL_LAWS.md
git commit -m "docs: add national transposition contribution template"
```

---

### Task 5.3: Implement Swedish NIS2 (Example)

**Files:**
- Create: `scripts/ingest-swedish-nis2.ts`
- Create: `data/seed/national-laws/se-nis2.json`

(This is the example implementation - shows pattern for others)

**Step 1: Research Swedish NIS2**

Find Swedish implementation:
- Law ID: SFS 2024:XXX (check Swedish legal database)
- URL: https://www.riksdagen.se/...

**Step 2: Implement scraper**

(Custom per country - Swedish government website structure)

**Step 3: Test and commit**

```bash
npx tsx scripts/ingest-swedish-nis2.ts
npm run build:db
git add scripts/ingest-swedish-nis2.ts data/seed/national-laws/se-nis2.json
git commit -m "feat(national-laws): add Swedish NIS2 transposition"
```

---

### Task 5.4: Create National Law Query Tool

**Files:**
- Create: `src/tools/national-laws.ts`

**Step 1: Implement tool**

```typescript
import type Database from 'better-sqlite3';

export interface GetNationalTranspositionInput {
  directive: string;
  member_state?: string;  // If omitted, return all countries
}

export interface NationalTransposition {
  directive: string;
  member_state: string;
  national_law_id: string;
  national_law_name: string;
  transposition_date: string;
  source_url: string;
  language: string;
}

export function getNationalTransposition(
  db: Database.Database,
  input: GetNationalTranspositionInput
): NationalTransposition[] {
  let query = 'SELECT * FROM national_transpositions WHERE directive = ?';
  const params: any[] = [input.directive];

  if (input.member_state) {
    query += ' AND member_state = ?';
    params.push(input.member_state);
  }

  return db.prepare(query).all(...params) as NationalTransposition[];
}
```

**Step 2: Register in MCP**

**Step 3: Commit tool**

```bash
git add src/tools/national-laws.ts src/index.ts
git commit -m "feat(tools): add national transposition query tool"
```

---

## PHASE 5 TARGET DELIVERABLES (Post-v1.0)

- ✅ national_transpositions schema
- ✅ transposition_mappings schema
- ✅ Ingestion template
- ✅ Contribution guide
- ✅ Swedish NIS2 (example)
- ✅ get_national_transposition tool
- ⚠️ Other countries (ongoing community contributions)

---

# COMPLETE IMPLEMENTATION TIMELINE

## Sprint 1 (Week 1-2): v0.3.0 - Recitals
- Days 1-2: Schema + types
- Days 3-4: Parsing logic
- Days 5-7: Tools + tests
- Days 8-10: Re-ingestion all regulations
- Days 11-12: Documentation + release

## Sprint 2 (Week 3-5): v0.4.0 - Delegated Acts
- Week 1: Schema + DORA RTS research
- Week 2: EBA scraper + tools
- Week 3: Testing + documentation + release

## Sprint 3 (Week 6-7): v0.5.0 - Amendment History
- Week 1: Schema + snapshot/diff logic
- Week 2: Tools + integration + release

## Sprint 4 (Week 8-10): v0.6.0 - Cross-References
- Week 1: Schema + citation extraction
- Week 2: Tools + graph generation
- Week 3: Testing + documentation + release

## Sprint 5+ (Ongoing): National Transpositions
- Initial: Template + contribution guide + Swedish example
- Ongoing: Community contributions (1 country per contributor)

---

# PLAN EXECUTION OPTIONS

Plan complete and saved to `docs/plans/2026-01-27-coverage-gaps-implementation.md`.

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration. Use superpowers:subagent-driven-development.

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints. Use superpowers:executing-plans.

**Which approach?**
