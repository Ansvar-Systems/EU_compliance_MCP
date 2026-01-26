# EU Regulations MCP Server - Development Guide

## Project Overview

MCP server providing searchable access to EU cybersecurity regulations. Local-first architecture using TypeScript, SQLite + FTS5.

## Key Directories

- `src/` - MCP server implementation (tools, database layer)
- `data/seed/` - Regulation JSON files (source of truth)
- `data/seed/applicability/` - Sector applicability rules
- `data/seed/mappings/` - ISO 27001 control mappings
- `scripts/` - Ingestion and build scripts
- `tests/` - Vitest test suite

## Regulations Included

| ID | Regulation | CELEX | Source |
|----|------------|-------|--------|
| GDPR | General Data Protection Regulation | 32016R0679 | EUR-Lex |
| NIS2 | Network and Information Security Directive | 32022L2555 | EUR-Lex |
| DORA | Digital Operational Resilience Act | 32022R2554 | EUR-Lex |
| AI_ACT | EU AI Act | 32024R1689 | EUR-Lex |
| CRA | Cyber Resilience Act | 32024R2847 | EUR-Lex |
| CYBERSECURITY_ACT | EU Cybersecurity Act | 32019R0881 | EUR-Lex |
| EIDAS2 | European Digital Identity (eIDAS 2.0) | 02014R0910-20241018 | EUR-Lex (consolidated) |
| DATA_ACT | Data Act | 32023R2854 | EUR-Lex |
| DSA | Digital Services Act | 32022R2065 | EUR-Lex |
| DMA | Digital Markets Act | 32022R1925 | EUR-Lex |
| UN_R155 | Vehicle Cybersecurity (UNECE) | 42021X0387 | EUR-Lex/UNECE |
| UN_R156 | Vehicle Software Updates (UNECE) | 42021X0388 | EUR-Lex/UNECE |

## Adding New Regulations

### EU Regulations (EUR-Lex)

Adding a regulation is **one command** — no code changes needed:

```bash
# 1. Ingest from EUR-Lex (auto-registers in source_registry)
npx tsx scripts/ingest-eurlex.ts <CELEX_ID> data/seed/<name>.json

# 2. Rebuild database
npm run build:db

# Done! The regulation is automatically:
# - Monitored by daily EUR-Lex checker
# - Included in RSS pattern matching
# - Re-ingested on auto-update
```

Optionally add applicability rules in `data/seed/applicability/<name>.json`

### source_registry Table (Single Source of Truth)

The `source_registry` table tracks all monitored regulations:

```sql
CREATE TABLE source_registry (
  regulation TEXT PRIMARY KEY,      -- e.g., "GDPR"
  celex_id TEXT,                    -- e.g., "32016R0679"
  eur_lex_version TEXT,             -- Last known EUR-Lex version date
  last_fetched TEXT,                -- ISO timestamp of last ingestion
  articles_expected INTEGER,
  articles_parsed INTEGER,
  quality_status TEXT               -- "complete", "partial", etc.
);
```

**No hardcoded lists anywhere** — this table drives:
- `npm run check-updates` (what to check)
- Daily workflow RSS pattern matching
- Auto-update re-ingestion loop

### UN/ECE Regulations

```bash
# 1. Add metadata to scripts/ingest-unece.ts UN_REGULATION_METADATA
# 2. Run ingestion (uses different parser for numbered sections)
npx tsx scripts/ingest-unece.ts <CELEX_ID> data/seed/<name>.json

# 3. Create applicability rules
# 4. Rebuild database
# 5. Run tests
```

## JSON Format

```json
{
  "id": "REGULATION_ID",
  "full_name": "Full Regulation Name",
  "celex_id": "32024RXXXX",
  "effective_date": "YYYY-MM-DD",
  "eur_lex_url": "https://eur-lex.europa.eu/...",
  "articles": [
    {
      "number": "1",
      "title": "Article Title",
      "text": "Full article text...",
      "chapter": "I"
    }
  ],
  "definitions": [
    {
      "term": "term name",
      "definition": "Definition text...",
      "article": "2"
    }
  ]
}
```

## Coding Guidelines

- Use TypeScript strict mode
- Run `npm test` before committing
- Keep regulation JSON files as source of truth (committed to git)
- Database (`regulations.db`) is built from seed files (gitignored)
- All regulation content must come from official public sources (EUR-Lex, UNECE)

## Common Tasks

```bash
# Development
npm run dev          # Run with hot reload
npm run build        # Build for production
npm test             # Run tests

# Database
npm run build:db     # Rebuild from seed files

# Ingestion
npx tsx scripts/ingest-eurlex.ts <CELEX> <OUTPUT>
npx tsx scripts/ingest-unece.ts <CELEX> <OUTPUT>
```

## Freshness Monitoring

### Daily EUR-Lex Update Check (`.github/workflows/check-updates.yml`)

Runs daily at 6 AM UTC:

1. **Reads CELEX IDs from database** (not hardcoded)
2. **Checks EUR-Lex RSS feeds** for recent legislative changes
3. **Runs full version comparison** via `check-updates.ts`
4. **Creates/updates GitHub issue** with label `eur-lex-update`
5. **Auto-closes issue** when all regulations are current

### Auto-Update Mode

Manual trigger with `auto_update: true`:
- Re-ingests all regulations from EUR-Lex
- Rebuilds database
- Bumps patch version
- Tags and pushes (triggers `publish.yml` → npm)

### Key Files

- `scripts/check-updates.ts` - Version comparison logic
- `.github/workflows/check-updates.yml` - Daily workflow
- `.github/workflows/publish.yml` - npm publish on tag

## GitHub Actions Secrets

For maintainers and forks:

| Secret | Required For | How to Get |
|--------|--------------|------------|
| `NPM_TOKEN` | `publish.yml` | npm → Access Tokens → Generate (Automation) |

The `GITHUB_TOKEN` is automatic and used for:
- Creating/updating issues in `check-updates.yml`
- Pushing tags in auto-update mode

## Phase 2 Roadmap

- [x] UN R156 (Software Update Management) ✅
- [x] Daily freshness monitoring ✅
- [x] eIDAS 2.0 (Digital Identity) ✅
- [x] ISO 27001 full control mappings (143 mappings across all 12 regulations) ✅
- [x] NIST CSF mappings (179 mappings across all 12 regulations) ✅
- [x] Data Act (data sharing and cloud switching) ✅
- [x] Digital Services Act (online platform regulation) ✅
- [x] Digital Markets Act (gatekeeper regulation) ✅
- [x] Full applicability rules for all regulations (105 rules) ✅
