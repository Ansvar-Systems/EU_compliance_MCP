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

## Regulations Included (37 Total)

### Core Data Protection & Cybersecurity
| ID | Regulation | CELEX | Source |
|----|------------|-------|--------|
| GDPR | General Data Protection Regulation | 32016R0679 | EUR-Lex |
| NIS2 | Network and Information Security Directive | 32022L2555 | EUR-Lex |
| DORA | Digital Operational Resilience Act | 32022R2554 | EUR-Lex |
| AI_ACT | EU AI Act | 32024R1689 | EUR-Lex |
| CRA | Cyber Resilience Act | 32024R2847 | EUR-Lex |
| CYBERSECURITY_ACT | EU Cybersecurity Act | 32019R0881 | EUR-Lex |
| CYBER_SOLIDARITY | Cyber Solidarity Act | 32025R0038 | EUR-Lex |
| EPRIVACY | ePrivacy Directive | 02002L0058-20091219 | EUR-Lex |
| LED | Law Enforcement Directive | 32016L0680 | EUR-Lex |
| EUCC | EU Common Criteria Certification | 32024R0482 | EUR-Lex |

### Digital Services & Identity
| ID | Regulation | CELEX | Source |
|----|------------|-------|--------|
| EIDAS2 | European Digital Identity (eIDAS 2.0) | 02014R0910-20241018 | EUR-Lex |
| DATA_ACT | Data Act | 32023R2854 | EUR-Lex |
| DSA | Digital Services Act | 32022R2065 | EUR-Lex |
| DMA | Digital Markets Act | 32022R1925 | EUR-Lex |
| DGA | Data Governance Act | 32022R0868 | EUR-Lex |
| EECC | European Electronic Communications Code | 32018L1972 | EUR-Lex |

### Healthcare & Medical
| ID | Regulation | CELEX | Source |
|----|------------|-------|--------|
| EHDS | European Health Data Space | 32025R0327 | EUR-Lex |
| MDR | Medical Device Regulation | 32017R0745 | EUR-Lex |
| IVDR | In Vitro Diagnostic Regulation | 32017R0746 | EUR-Lex |

### Financial Services
| ID | Regulation | CELEX | Source |
|----|------------|-------|--------|
| MICA | Markets in Crypto-Assets | 32023R1114 | EUR-Lex |
| PSD2 | Payment Services Directive 2 | 32015L2366 | EUR-Lex |
| MIFID2 | Markets in Financial Instruments Directive II | 32014L0065 | EUR-Lex |
| MIFIR | Markets in Financial Instruments Regulation | 32014R0600 | EUR-Lex |
| AIFMD | Alternative Investment Fund Managers Directive | 32011L0061 | EUR-Lex |
| SFDR | Sustainable Finance Disclosure Regulation | 32019R2088 | EUR-Lex |
| EU_TAXONOMY | EU Taxonomy Regulation | 32020R0852 | EUR-Lex |

### Product Safety & Liability
| ID | Regulation | CELEX | Source |
|----|------------|-------|--------|
| GPSR | General Product Safety Regulation | 32023R0988 | EUR-Lex |
| MACHINERY | Machinery Regulation | 32023R1230 | EUR-Lex |
| PLD | Product Liability Directive | 32024L2853 | EUR-Lex |
| RED | Radio Equipment Directive | 32014L0053 | EUR-Lex |

### Critical Infrastructure
| ID | Regulation | CELEX | Source |
|----|------------|-------|--------|
| CER | Critical Entities Resilience Directive | 32022L2557 | EUR-Lex |

### Sustainability & Supply Chain
| ID | Regulation | CELEX | Source |
|----|------------|-------|--------|
| CSRD | Corporate Sustainability Reporting Directive | 32022L2464 | EUR-Lex |
| CSDDD | Corporate Sustainability Due Diligence Directive | 32024L1760 | EUR-Lex |
| CBAM | Carbon Border Adjustment Mechanism | 32023R0956 | EUR-Lex |
| EUDR | EU Deforestation Regulation | 32023R1115 | EUR-Lex |

### Automotive
| ID | Regulation | CELEX | Source |
|----|------------|-------|--------|
| UN_R155 | Vehicle Cybersecurity (UNECE) | 42021X0387 | EUR-Lex/UNECE |
| UN_R156 | Vehicle Software Updates (UNECE) | 42021X0388 | EUR-Lex/UNECE |

## Adding New Regulations

### For End Users

**End users cannot add regulations** — the package ships with a pre-built database containing all 37 regulations. The database is bundled in the npm package (15MB) and includes all articles, recitals, definitions, and control mappings.

### For Maintainers Only

Adding a regulation requires Puppeteer for EUR-Lex WAF bypass and re-publishing the package.

#### EU Regulations (EUR-Lex)

```bash
# 1. Ingest from EUR-Lex (requires Puppeteer - auto-registers in source_registry)
npx tsx scripts/ingest-eurlex.ts <CELEX_ID> data/seed/<name>.json

# 2. Ingest recitals (uses same Puppeteer session)
npx tsx scripts/ingest-recitals.ts <CELEX_ID> data/seed/<name>.json

# 3. Rebuild database
npm run build:db

# 4. Test and publish
npm test
npm version patch
npm publish

# Done! The regulation is automatically:
# - Monitored by daily EUR-Lex checker
# - Included in RSS pattern matching
# - Re-ingested on auto-update
```

Optionally add applicability rules in `data/seed/applicability/<name>.json`

**Why Puppeteer?** EUR-Lex has WAF protection that blocks simple HTTP requests. Puppeteer renders the page in a real browser, bypassing detection.

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

## Pre-Built Database Architecture

### Why Pre-Built?

The package ships with a **pre-built database** (`data/regulations.db`, ~15MB) committed to git and included in the npm package. This ensures:

1. **Zero setup friction** - Users never need to run build steps or ingestion scripts
2. **Consistent state** - Everyone gets the same validated database version
3. **EUR-Lex WAF bypass** - Ingestion requires Puppeteer (browser automation), which isn't viable for end users
4. **Fast installs** - No need to process 2,278 articles + 3,508 recitals on user machines

### Database Contents

| Component | Count | Size |
|-----------|-------|------|
| Articles | 2,311 | ~8MB |
| Recitals | 3,508 (33/37 regulations) | ~5MB |
| Definitions | 1,145 | ~1MB |
| Control Mappings | 686 | ~500KB |
| Applicability Rules | 305 | ~200KB |
| FTS5 Index | - | ~800KB |
| **Total** | **~8,000 entries** | **~15MB** |

### When Maintainers Rebuild

Maintainers rebuild the database when:
- Adding new regulations
- EUR-Lex publishes updates (detected by daily workflow)
- Fixing parsing errors in existing regulations

**Build Process:**
```bash
npm run build:db  # Reads JSON files from data/seed/
```

This regenerates `data/regulations.db` from source JSON files. The database is then:
1. Committed to git
2. Included in the npm package via `package.json` files array
3. Published to npm (triggers when version is tagged)

### Source of Truth

- **JSON files** (`data/seed/*.json`) are the canonical source (committed to git)
- **Database** (`data/regulations.db`) is built from JSON (also committed to git for distribution)
- Users get both in the npm package, but only interact with the database

## Coding Guidelines

- Use TypeScript strict mode
- Run `npm test` before committing
- Keep regulation JSON files as source of truth (committed to git)
- **Database is also committed to git** (for npm distribution) and rebuilt via `npm run build:db`
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
| `SLACK_WEBHOOK_URL` | `check-updates.yml` (optional) | Slack → Create Incoming Webhook |
| `DISCORD_WEBHOOK_URL` | `check-updates.yml` (optional) | Discord → Server Settings → Webhooks |
| `DISCORD_MENTION_ROLE_ID` | `check-updates.yml` (optional) | Discord role ID for mentions |
| `GENERIC_WEBHOOK_URL` | `check-updates.yml` (optional) | Any HTTPS endpoint for JSON payloads |

The `GITHUB_TOKEN` is automatic and used for:
- Creating/updating issues in `check-updates.yml`
- Pushing tags in auto-update mode

**Webhook Notifications:** All webhook secrets are optional. The workflow will skip webhook notifications if secrets are not configured, but will continue to create GitHub issues. Use `continue-on-error: true` to ensure webhook failures don't break the workflow.

## Current Statistics

| Category | Count |
|----------|-------|
| Regulations | 37 |
| Articles | 2,311 |
| Recitals | 3,508 (33/37 regulations) |
| Definitions | 1,145 |
| ISO 27001 Mappings | 313 |
| NIST CSF 2.0 Mappings | 373 |
| Applicability Rules | 305 |
| **Database Size** | **~15MB** |

## Completed Features

- [x] 37 EU regulations from EUR-Lex with full text
- [x] Daily freshness monitoring via GitHub Actions
- [x] Auto-update mode for re-ingestion from EUR-Lex
- [x] ISO 27001:2022 control mappings (313 mappings across all regulations)
- [x] NIST CSF 2.0 control mappings (373 mappings across all regulations)
- [x] Sector applicability rules (305 rules across all regulations)
- [x] Full-text search via SQLite FTS5
- [x] Cross-regulation comparison tools
