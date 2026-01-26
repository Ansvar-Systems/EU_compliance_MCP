# Architectural Patterns

> Design patterns and conventions used in Ansvar MCP servers

This document describes the architectural patterns used in our MCP servers. Following these patterns ensures consistency across the ecosystem and makes it easier for contributors to understand the codebase.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Naming Conventions](#naming-conventions)
3. [TypeScript Patterns](#typescript-patterns)
4. [Database Patterns](#database-patterns)
5. [Tool Patterns](#tool-patterns)
6. [Error Handling](#error-handling)
7. [Testing Patterns](#testing-patterns)
8. [Data Pipeline](#data-pipeline)

---

## Project Structure

### Directory Layout

```
your-mcp-server/
├── src/                    # Source code
│   ├── index.ts            # Entry point (server setup)
│   └── tools/              # One file per tool
│       ├── search.ts
│       ├── get-item.ts
│       └── ...
├── scripts/                # Build and data scripts
│   ├── build-db.ts
│   ├── ingest-source.ts
│   └── check-updates.ts
├── tests/                  # Test files
│   ├── fixtures/
│   │   └── test-db.ts
│   └── tools/
│       └── *.test.ts
├── data/                   # Data files
│   ├── database.db
│   └── seed/
└── dist/                   # Compiled output (generated)
```

### Rationale

- **`src/tools/`**: Each tool in its own file for isolation and testability
- **`scripts/`**: Data pipeline scripts separate from runtime code
- **`tests/fixtures/`**: Shared test infrastructure
- **`data/seed/`**: Source of truth for database content

---

## Naming Conventions

### Files

| Type | Convention | Example |
|------|------------|---------|
| Tool | `kebab-case.ts` | `get-item.ts` |
| Test | `kebab-case.test.ts` | `get-item.test.ts` |
| Script | `kebab-case.ts` | `build-db.ts` |

### Interfaces

```typescript
// Input interface: {ToolName}Input
export interface SearchInput {
  query: string;
  sources?: string[];
  limit?: number;
}

// Output interface: {ToolName}Result or descriptive noun
export interface SearchResult {
  source: string;
  item_id: string;
  snippet: string;
  relevance: number;
}

// Entity interface: descriptive noun
export interface Item {
  source: string;
  item_id: string;
  title: string | null;
  text: string;
}
```

### Functions

```typescript
// Tool functions: camelCase, verb prefix
export async function searchContent(db, input) { }
export async function getItem(db, input) { }
export async function listSources(db, input) { }
export async function lookupDefinition(db, input) { }

// Helper functions: camelCase, descriptive
function escapeFTS5Query(query: string): string { }
function parseJsonField<T>(value: string | null): T | null { }
```

### Database

```typescript
// Tables: snake_case, plural
sources
items
definitions
applicability_rules

// Columns: snake_case
item_id
full_name
effective_date

// Indexes: idx_{table}_{column(s)}
idx_items_source_parent
idx_definitions_term
```

### MCP Tools

```typescript
// Tool names: snake_case, verb_noun
search_content
get_item
list_sources
lookup_definition
check_applicability
```

---

## TypeScript Patterns

### Async Functions

All tool functions are async, even if currently synchronous:

```typescript
// ✅ Good - async for future-proofing
export async function getItem(
  db: Database,
  input: GetItemInput
): Promise<Item | null> {
  // Implementation
}

// ❌ Bad - non-async limits flexibility
export function getItem(db: Database, input: GetItemInput): Item | null {
  // Implementation
}
```

### Null vs Undefined

- Use `null` for "intentionally empty" or "not found"
- Use `undefined` for "not provided" (optional parameters)

```typescript
// Interface with optional property
interface GetItemInput {
  source: string;
  item_id: string;
  include_related?: boolean;  // undefined if not provided
}

// Return null for not found
export async function getItem(db, input): Promise<Item | null> {
  const row = db.prepare(sql).get(input.source, input.item_id);
  if (!row) return null;  // Not found
  return { ... };
}
```

### Input Validation

Validate at the boundary, trust internally:

```typescript
export async function getItem(db: Database, input: GetItemInput) {
  // ✅ Validate user input
  if (!input.source || input.source.trim().length === 0) {
    throw new Error('source is required');
  }

  // Normalize input
  const source = input.source.trim();
  const limit = Math.min(input.limit ?? 10, 50);  // Cap at max

  // Now trust the normalized values
  const rows = db.prepare(sql).all(source, limit);
}
```

### Default Values

Use nullish coalescing for defaults:

```typescript
// ✅ Good - handles both undefined and null
const limit = input.limit ?? 10;
const sources = input.sources ?? [];

// ❌ Avoid - doesn't handle null, handles 0/empty string incorrectly
const limit = input.limit || 10;
```

---

## Database Patterns

### Connection Management

Use singleton pattern with lazy initialization:

```typescript
let dbInstance: Database | null = null;

function getDb(): Database {
  if (!dbInstance) {
    const dbPath = process.env.DB_PATH || getDefaultPath();
    dbInstance = new Database(dbPath, { readonly: true });
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
```

### Prepared Statements

Always use parameterized queries:

```typescript
// ✅ Good - parameterized
const sql = `SELECT * FROM items WHERE source = ? AND item_id = ?`;
const row = db.prepare(sql).get(source, item_id);

// ❌ Bad - SQL injection risk
const sql = `SELECT * FROM items WHERE source = '${source}'`;
```

### JSON Fields

SQLite stores JSON as TEXT. Parse on read:

```typescript
// Database row type (raw)
interface ItemRow {
  metadata: string | null;  // JSON string
  related: string | null;   // JSON array string
}

// Parse helper
function parseJsonField<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// Usage
const metadata = parseJsonField<Record<string, unknown>>(row.metadata);
const related = parseJsonField<RelatedItem[]>(row.related);
```

### FTS5 Queries

Escape special characters for safe queries:

```typescript
function escapeFTS5Query(query: string): string {
  // FTS5 special characters: " ( ) * : ^
  return query.replace(/[\"()*:^]/g, char => `"${char}"`);
}

// Usage
const safeQuery = escapeFTS5Query(input.query);
const sql = `SELECT * FROM items_fts WHERE items_fts MATCH ?`;
db.prepare(sql).all(safeQuery);
```

---

## Tool Patterns

### Standard Tool Structure

```typescript
/**
 * Tool description
 */

import type { Database } from 'better-sqlite3';

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export interface ToolInput {
  // Required parameters first
  required_param: string;
  // Optional parameters last
  optional_param?: number;
}

export interface ToolResult {
  // Result fields
}

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// ─────────────────────────────────────────────────────────────────
// MAIN FUNCTION
// ─────────────────────────────────────────────────────────────────

export async function toolFunction(
  db: Database,
  input: ToolInput
): Promise<ToolResult[]> {
  // 1. Validate input
  // 2. Normalize input
  // 3. Build query
  // 4. Execute query
  // 5. Transform results
  // 6. Return
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function helperFunction() { }
```

### Tool Registration

In `src/index.ts`:

```typescript
const TOOLS: Tool[] = [
  {
    name: 'tool_name',
    description: `Description line 1.

Supports:
- Feature 1
- Feature 2`,
    inputSchema: {
      type: 'object',
      properties: {
        required_param: {
          type: 'string',
          description: 'Description of parameter',
        },
        optional_param: {
          type: 'number',
          description: 'Description (default: 10)',
        },
      },
      required: ['required_param'],
    },
  },
];
```

---

## Error Handling

### In Tools

Return null/empty for "not found", throw for invalid input:

```typescript
export async function getItem(db, input) {
  // Throw for invalid input
  if (!input.source) {
    throw new Error('source is required');
  }

  // Return null for not found (not an error)
  const row = db.prepare(sql).get(input.source, input.item_id);
  if (!row) return null;

  return { ... };
}
```

### In Index.ts

Catch all errors and return MCP error format:

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await toolFunction(getDb(), args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
});
```

---

## Testing Patterns

### Test Structure

```typescript
describe('toolFunction', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  describe('happy path', () => {
    it('should return results for valid input', async () => {
      const result = await toolFunction(db, validInput);
      expect(result).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', async () => {
      const result = await toolFunction(db, { query: '' });
      expect(result).toEqual([]);
    });
  });
});
```

### Test Database

Use in-memory database with sample data:

```typescript
export function createTestDatabase(): Database {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
  insertSampleData(db);
  return db;
}
```

### What to Test

| Test Type | What | Example |
|-----------|------|---------|
| Happy path | Normal operation | Search returns results |
| Edge cases | Unusual inputs | Empty query, special chars |
| Not found | Missing data | Unknown source |
| Filtering | Parameter combinations | Source + limit |
| Validation | Invalid input | Missing required field |

---

## Data Pipeline

### Pipeline Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Source    │     │ ingest-*.ts │     │ seed/*.json │
│  (EUR-Lex)  │ ──► │   (script)  │ ──► │   (files)   │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                    ┌─────────────┐     ┌─────────────┐
                    │ database.db │ ◄── │ build-db.ts │
                    │   (output)  │     │   (script)  │
                    └─────────────┘     └─────────────┘
```

### Seed File Format

```json
{
  "id": "SOURCE_ID",
  "full_name": "Full Name",
  "identifier": "official-id",
  "effective_date": "2024-01-01",
  "source_url": "https://...",
  "items": [
    {
      "item_id": "1",
      "title": "Title",
      "text": "Content...",
      "parent": "Chapter I"
    }
  ],
  "definitions": [
    {
      "term": "term",
      "definition": "Definition...",
      "defining_item": "2"
    }
  ]
}
```

### Update Process

1. Run `npm run check-updates` to detect changes
2. Run `npm run ingest -- <id> <output>` to re-fetch
3. Run `npm run build:db` to rebuild database
4. Test with `npm test`
5. Commit and release

---

## Quick Reference

### Common SQL Patterns

```sql
-- FTS5 search with BM25 ranking
SELECT *, bm25(items_fts) as score
FROM items_fts WHERE items_fts MATCH ?
ORDER BY score LIMIT ?;

-- Count by source
SELECT source, COUNT(*) as count
FROM items GROUP BY source;

-- Get with JSON parsing
SELECT *, json_extract(metadata, '$.key') as value
FROM items WHERE source = ?;
```

### Common TypeScript Patterns

```typescript
// Default with cap
const limit = Math.min(input.limit ?? 10, 50);

// Array from optional
const sources = input.sources ?? [];

// Safe JSON parse
const data = value ? JSON.parse(value) : null;

// Dynamic WHERE
const conditions: string[] = [];
if (input.source) conditions.push('source = ?');
const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
```

---

<p align="center">
<strong>Ansvar Systems AB</strong><br>
ansvar.ai
</p>
