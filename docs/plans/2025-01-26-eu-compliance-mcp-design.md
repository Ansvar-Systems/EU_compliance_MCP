# EU Compliance MCP Server - Design Document

**Date:** 2025-01-26
**Status:** Approved
**License:** MIT

## Overview

An open-source MCP (Model Context Protocol) server providing access to EU cybersecurity regulations. Local-first architecture, TypeScript implementation, SQLite + FTS5 for search.

Fills a gap: US legal MCP tools exist, EU compliance tools don't.

## Goals

**Phase 1 (MVP):**
- All Tier 1 EU regulations searchable via MCP
- 7 tools covering search, comparison, mapping, and applicability
- Local-only, ships as npm package
- Source registry for quality/update tracking

**Phase 2 (Future):**
- Automotive regulations (R155, R156, ISO 21434)
- Hosted server option on Hetzner
- Premium features (real-time updates, advanced mappings)

## Regulations (Phase 1)

| Regulation | CELEX ID | Articles | Purpose |
|------------|----------|----------|---------|
| GDPR | 32016R0679 | 99 | Data protection foundation |
| NIS2 | 32022L2555 | 46 | Critical infrastructure security |
| DORA | 32022R2554 | 64 | Financial sector resilience |
| AI Act | 32024R1689 | 113 | AI system requirements |
| Cyber Resilience Act | 32024R2847 | TBD | Product security |
| EU Cybersecurity Act | 32019R0881 | 69 | ENISA, certification |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Claude Desktop                     │
│                   (MCP Client)                       │
└─────────────────────┬───────────────────────────────┘
                      │ stdio (JSON-RPC)
                      ▼
┌─────────────────────────────────────────────────────┐
│              eu-compliance-mcp                       │
│                (MCP Server)                          │
├─────────────────────────────────────────────────────┤
│  Tools:                                              │
│  - search_regulations    - map_controls              │
│  - get_article          - check_applicability        │
│  - list_regulations     - get_definitions            │
│  - compare_requirements                              │
├─────────────────────────────────────────────────────┤
│  Database Layer:                                     │
│  - SQLite + FTS5                                     │
│  - Prepared queries                                  │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              regulations.db                          │
│  - articles table (FTS5)                            │
│  - regulations metadata                              │
│  - control_mappings                                  │
│  - source_registry                                   │
└─────────────────────────────────────────────────────┘
```

## MCP Tools

### 1. search_regulations
Full-text search across all regulations.

```typescript
interface SearchInput {
  query: string;
  regulations?: string[];  // Filter to specific regulations
  limit?: number;          // Default 10
}

interface SearchResult {
  regulation: string;
  article: string;
  title: string;
  snippet: string;         // Highlighted match
  relevance: number;
}
```

### 2. get_article
Retrieve specific article with full text and context.

```typescript
interface GetArticleInput {
  regulation: string;      // "GDPR", "NIS2", etc.
  article: string;         // "17", "23(1)", etc.
  include_recitals?: boolean;
}

interface Article {
  regulation: string;
  article_number: string;
  title: string;
  text: string;
  related_recitals?: string[];
  cross_references?: string[];
}
```

### 3. list_regulations
List available regulations and their structure.

```typescript
interface ListInput {
  regulation?: string;     // If provided, list chapters/articles
}

interface RegulationInfo {
  id: string;
  name: string;
  celex_id: string;
  effective_date: string;
  chapters?: Chapter[];
  article_count: number;
}
```

### 4. compare_requirements
Side-by-side comparison on a topic.

```typescript
interface CompareInput {
  topic: string;           // "incident reporting", "risk assessment"
  regulations: string[];   // ["DORA", "NIS2"]
}

interface Comparison {
  topic: string;
  regulations: {
    regulation: string;
    requirements: string[];
    articles: string[];
    timelines?: string;
  }[];
  key_differences: string[];
}
```

### 5. map_controls
Map ISO 27001 controls to regulation requirements.

```typescript
interface MapControlsInput {
  framework: "ISO27001";   // Only ISO 27001:2022 in Phase 1
  control?: string;        // Specific control, e.g., "A.5.1"
  regulation?: string;     // Filter to specific regulation
}

interface ControlMapping {
  control_id: string;
  control_name: string;
  mappings: {
    regulation: string;
    articles: string[];
    coverage: "full" | "partial" | "related";
    notes: string;
  }[];
}
```

### 6. check_applicability
Determine which regulations apply to an entity.

```typescript
interface ApplicabilityInput {
  sector: Sector;
  subsector?: string;
  member_state?: string;   // ISO country code
  size?: "sme" | "large";
}

type Sector =
  | "financial"
  | "healthcare"
  | "energy"
  | "transport"
  | "digital_infrastructure"
  | "public_administration"
  | "manufacturing"
  | "other";

interface ApplicabilityResult {
  entity: ApplicabilityInput;
  applicable_regulations: {
    regulation: string;
    confidence: "definite" | "likely" | "possible";
    basis: string;         // Which article defines scope
    notes: string;
  }[];
}
```

### 7. get_definitions
Official definitions from regulation text.

```typescript
interface DefinitionsInput {
  term: string;
  regulation?: string;     // Filter to specific regulation
}

interface Definition {
  term: string;
  regulation: string;
  article: string;         // Usually Article 2 or 3
  definition: string;
  related_terms?: string[];
}
```

## Database Schema

```sql
-- Core regulation metadata
CREATE TABLE regulations (
  id TEXT PRIMARY KEY,           -- "GDPR", "NIS2", etc.
  full_name TEXT NOT NULL,
  celex_id TEXT NOT NULL,
  effective_date TEXT,
  last_amended TEXT,
  eur_lex_url TEXT
);

-- Articles with FTS5 for search
CREATE VIRTUAL TABLE articles_fts USING fts5(
  regulation,
  article_number,
  title,
  text,
  content='articles',
  content_rowid='rowid'
);

CREATE TABLE articles (
  rowid INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  article_number TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  chapter TEXT,
  recitals TEXT,              -- JSON array of related recital numbers
  cross_references TEXT,      -- JSON array of cross-referenced articles
  UNIQUE(regulation, article_number)
);

-- Definitions extracted from Article 2/3
CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  article TEXT NOT NULL,
  UNIQUE(regulation, term)
);

-- ISO 27001:2022 control mappings
CREATE TABLE control_mappings (
  id INTEGER PRIMARY KEY,
  control_id TEXT NOT NULL,      -- "A.5.1", "A.5.2", etc.
  control_name TEXT NOT NULL,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  articles TEXT NOT NULL,        -- JSON array
  coverage TEXT CHECK(coverage IN ('full', 'partial', 'related')),
  notes TEXT
);

-- Applicability rules
CREATE TABLE applicability_rules (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  sector TEXT NOT NULL,
  subsector TEXT,
  applies BOOLEAN NOT NULL,
  confidence TEXT CHECK(confidence IN ('definite', 'likely', 'possible')),
  basis_article TEXT,
  notes TEXT
);

-- Source registry for tracking data quality
CREATE TABLE source_registry (
  regulation TEXT PRIMARY KEY REFERENCES regulations(id),
  celex_id TEXT NOT NULL,
  eur_lex_version TEXT,
  last_fetched TEXT,
  articles_expected INTEGER,
  articles_parsed INTEGER,
  quality_status TEXT CHECK(quality_status IN ('complete', 'review', 'incomplete')),
  notes TEXT
);

-- FTS5 triggers
CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, regulation, article_number, title, text)
  VALUES (new.rowid, new.regulation, new.article_number, new.title, new.text);
END;

CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, regulation, article_number, title, text)
  VALUES('delete', old.rowid, old.regulation, old.article_number, old.title, old.text);
END;

CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, regulation, article_number, title, text)
  VALUES('delete', old.rowid, old.regulation, old.article_number, old.title, old.text);
  INSERT INTO articles_fts(rowid, regulation, article_number, title, text)
  VALUES (new.rowid, new.regulation, new.article_number, new.title, new.text);
END;
```

## Project Structure

```
eu-compliance-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/
│   │   ├── search.ts         # search_regulations
│   │   ├── article.ts        # get_article
│   │   ├── list.ts           # list_regulations
│   │   ├── compare.ts        # compare_requirements
│   │   ├── map.ts            # map_controls
│   │   ├── applicability.ts  # check_applicability
│   │   └── definitions.ts    # get_definitions
│   ├── db/
│   │   ├── schema.sql        # SQLite + FTS5 schema
│   │   ├── client.ts         # Database connection
│   │   └── queries.ts        # Prepared queries
│   └── types/
│       └── index.ts          # TypeScript types
├── data/
│   ├── regulations.db        # SQLite database (gitignored, built on install)
│   └── seed/
│       ├── gdpr.json
│       ├── nis2.json
│       ├── dora.json
│       ├── ai-act.json
│       ├── cra.json
│       ├── cybersecurity-act.json
│       └── mappings/
│           └── iso27001.json
├── scripts/
│   ├── ingest.ts             # EUR-Lex fetcher + parser
│   ├── build-db.ts           # Build SQLite from seed JSON
│   ├── validate.ts           # Quality checker
│   └── check-updates.ts      # EUR-Lex update monitor
├── tests/
│   ├── tools/
│   │   ├── search.test.ts
│   │   ├── article.test.ts
│   │   └── ...
│   └── fixtures/
│       └── sample-articles.json
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE                   # MIT
```

## Data Ingestion Pipeline

```
EUR-Lex (CELEX ID)
       │
       ▼
┌─────────────────┐
│  ingest.ts      │  Fetch HTML/XML from EUR-Lex API
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Parser         │  Extract articles, recitals, definitions
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  seed/*.json    │  Structured JSON, committed to repo
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  validate.ts    │  Check completeness, flag issues
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  build-db.ts    │  Generate regulations.db (on npm install)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ regulations.db  │  Ready for queries
└─────────────────┘
```

## Source Registry Tracking

| Regulation | CELEX ID | EUR-Lex Version | Last Fetched | Expected | Parsed | Status |
|------------|----------|-----------------|--------------|----------|--------|--------|
| GDPR | 32016R0679 | 2016-04-27 | - | 99 | - | pending |
| NIS2 | 32022L2555 | 2022-12-14 | - | 46 | - | pending |
| DORA | 32022R2554 | 2022-12-14 | - | 64 | - | pending |
| AI Act | 32024R1689 | 2024-07-12 | - | 113 | - | pending |
| CRA | 32024R2847 | 2024-11-20 | - | TBD | - | pending |
| Cybersecurity Act | 32019R0881 | 2019-06-07 | - | 69 | - | pending |

## Configuration

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "eu-compliance": {
      "command": "npx",
      "args": ["-y", "eu-compliance-mcp"]
    }
  }
}
```

### Or local development:

```json
{
  "mcpServers": {
    "eu-compliance": {
      "command": "node",
      "args": ["/path/to/eu-compliance-mcp/dist/index.js"]
    }
  }
}
```

## Testing Strategy

### Unit Tests
- Each tool tested in isolation
- Mock database for speed
- Edge cases: missing articles, ambiguous queries

### Integration Tests
- Full database with sample data
- Real queries matching expected use cases
- Cross-reference validation

### Test Cases (from requirements)

| Test | Query | Expected |
|------|-------|----------|
| Basic retrieval | "What are the incident reporting timelines under NIS2?" | Article 23 details, 24/72 hour timelines |
| Cross-reference | "How does DORA incident reporting differ from NIS2?" | Comparison of DORA Art 17 vs NIS2 Art 23 |
| Control mapping | "What ISO 27001 controls satisfy NIS2 Article 21?" | List of mapped controls |
| Practical | "What documentation do I need for DORA compliance?" | Articles on policies, procedures |
| Edge case | "What does Article 999 of GDPR say?" | Error: article not found |

## Error Handling

```typescript
// Consistent error format
interface MCPError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Error codes
const ErrorCodes = {
  REGULATION_NOT_FOUND: "regulation_not_found",
  ARTICLE_NOT_FOUND: "article_not_found",
  INVALID_QUERY: "invalid_query",
  DATABASE_ERROR: "database_error",
} as const;
```

## Phase 2 Roadmap

1. **Automotive regulations** - R155, R156, ISO 21434 (licensing considerations)
2. **Hosted server** - Hetzner deployment, API keys, rate limiting
3. **Real-time updates** - Webhook on EUR-Lex changes
4. **Advanced mappings** - NIST CSF, ISO 27701
5. **Compliance checklists** - Actionable requirements per regulation
6. **Ansvar integration** - Premium features, consulting upsell

## Open Questions (Resolved)

- ~~Python or TypeScript?~~ → TypeScript
- ~~Embeddings?~~ → No, FTS5 sufficient for legal text
- ~~Which regulations for MVP?~~ → All Tier 1
- ~~License?~~ → MIT

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [EUR-Lex](https://eur-lex.europa.eu/)
- [CELEX Numbers](https://eur-lex.europa.eu/content/help/eurlex-content/celex-number.html)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
