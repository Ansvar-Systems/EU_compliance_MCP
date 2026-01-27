# Migration Strategy: Unified Service Layer

This document outlines how to migrate from `src/tools/registry.ts` to the unified service layer in `packages/core/`.

## Overview

```
Before (v0.4.1):
src/tools/registry.ts
├── Tool definitions
├── Business logic
└── Direct database calls (better-sqlite3)

After (v0.5.0):
packages/core/
├── adapters/
│   ├── database-adapter.ts  ← Interface
│   ├── sqlite-adapter.ts    ← SQLite implementation
│   └── postgresql-adapter.ts ← PostgreSQL implementation
└── services/
    └── regulations-service.ts ← Business logic
```

## Benefits

1. **Database Agnostic**: MCP users keep SQLite, Teams users get PostgreSQL
2. **Single Source of Truth**: Change logic once, applies everywhere
3. **Backward Compatible**: Existing MCP users see zero changes
4. **Easy Testing**: Mock database adapter for unit tests
5. **Future Proof**: Add MySQL, MongoDB, etc. without touching business logic

## Step 1: MCP Server Refactor

### Before (v0.4.1)

```typescript
// src/index.ts
import { registerTools } from './tools/registry.js';
import Database from 'better-sqlite3';

const db = new Database('data/regulations.db', { readonly: true });
const server = new Server({ name: 'eu-regulations-mcp', version: '0.4.1' });

registerTools(server, db);
```

### After (v0.5.0)

```typescript
// src/index.ts
import { createDatabaseAdapter, RegulationsService } from '@ansvar/eu-regulations-core';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Automatically uses SQLite if DATABASE_URL not set
const adapter = createDatabaseAdapter();
const service = new RegulationsService(adapter);

const server = new Server(
  { name: 'eu-regulations-mcp', version: '0.5.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_regulations',
      description: 'Search across all regulations',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          regulations: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number', default: 10 }
        },
        required: ['query']
      }
    },
    {
      name: 'get_article',
      description: 'Get a specific article',
      inputSchema: {
        type: 'object',
        properties: {
          regulation: { type: 'string' },
          article: { type: 'string' }
        },
        required: ['regulation', 'article']
      }
    },
    // ... rest of tools from registry.ts
  ]
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    let result;

    switch (request.params.name) {
      case 'search_regulations':
        result = await service.searchRegulations(request.params.arguments);
        break;

      case 'get_article':
        result = await service.getArticle(
          request.params.arguments.regulation,
          request.params.arguments.article
        );
        break;

      case 'get_recital':
        result = await service.getRecital(
          request.params.arguments.regulation,
          request.params.arguments.recital_number
        );
        break;

      case 'list_regulations':
        result = await service.listRegulations(request.params.arguments?.regulation);
        break;

      case 'compare_requirements':
        result = await service.compareRequirements(request.params.arguments);
        break;

      case 'map_controls':
        result = await service.mapControls(request.params.arguments);
        break;

      case 'check_applicability':
        result = await service.checkApplicability(request.params.arguments);
        break;

      case 'get_definitions':
        result = await service.getDefinitions(
          request.params.arguments?.term,
          request.params.arguments?.regulation
        );
        break;

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }],
      isError: true
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Step 2: REST API Integration

The REST API automatically uses the same service:

```typescript
// packages/rest-api/src/server.ts
import { createDatabaseAdapter, RegulationsService } from '@ansvar/eu-regulations-core';

// Uses PostgreSQL if DATABASE_URL is set
const adapter = createDatabaseAdapter();
const service = new RegulationsService(adapter);

// Express routes call service methods
app.post('/api/search', async (req, res) => {
  const result = await service.searchRegulations(req.body);
  res.json(result);
});

app.get('/api/articles/:regulation/:number', async (req, res) => {
  const result = await service.getArticle(req.params.regulation, req.params.number);
  res.json(result);
});
```

## Step 3: Environment-Based Behavior

### MCP Server (SQLite)

```bash
# No DATABASE_URL → uses SQLite
npx eu-regulations-mcp

# Output:
# 📊 Using SQLite adapter
# ✅ Database loaded: data/regulations.db
```

### REST API (PostgreSQL)

```bash
# DATABASE_URL set → uses PostgreSQL
export DATABASE_URL="postgresql://..."
npm run start:api

# Output:
# 📊 Using PostgreSQL adapter
# ✅ Connected to PostgreSQL
```

### Both at once (different processes)

```bash
# Terminal 1: MCP server (SQLite)
npx eu-regulations-mcp

# Terminal 2: REST API (PostgreSQL)
DATABASE_URL="postgresql://..." npm run start:api
```

## Step 4: Testing Strategy

### Unit Tests (Mock Adapter)

```typescript
// tests/unit/regulations-service.test.ts
import { RegulationsService } from '@ansvar/eu-regulations-core';
import type { DatabaseAdapter } from '@ansvar/eu-regulations-core';

describe('RegulationsService', () => {
  let mockAdapter: DatabaseAdapter;
  let service: RegulationsService;

  beforeEach(() => {
    mockAdapter = {
      searchArticles: vi.fn().mockResolvedValue([/* mock data */]),
      getArticle: vi.fn().mockResolvedValue(/* mock data */),
      // ... mock other methods
    };
    service = new RegulationsService(mockAdapter);
  });

  it('should search regulations', async () => {
    const result = await service.searchRegulations({
      query: 'incident reporting',
      limit: 5
    });

    expect(mockAdapter.searchArticles).toHaveBeenCalledWith(
      'incident reporting',
      undefined,
      5
    );
    expect(result.count).toBe(/* expected count */);
  });
});
```

### Integration Tests (Real Databases)

```typescript
// tests/integration/sqlite-adapter.test.ts
import { SQLiteAdapter } from '@ansvar/eu-regulations-core';

describe('SQLiteAdapter', () => {
  let adapter: SQLiteAdapter;

  beforeAll(() => {
    adapter = new SQLiteAdapter('data/regulations.db');
  });

  afterAll(async () => {
    await adapter.close();
  });

  it('should search articles', async () => {
    const results = await adapter.searchArticles('incident', [], 5);
    expect(results.length).toBeGreaterThan(0);
  });
});

// tests/integration/postgresql-adapter.test.ts
import { PostgreSQLAdapter } from '@ansvar/eu-regulations-core';

describe('PostgreSQLAdapter', () => {
  let adapter: PostgreSQLAdapter;

  beforeAll(() => {
    adapter = new PostgreSQLAdapter(process.env.TEST_DATABASE_URL!);
  });

  afterAll(async () => {
    await adapter.close();
  });

  it('should search articles', async () => {
    const results = await adapter.searchArticles('incident', [], 5);
    expect(results.length).toBeGreaterThan(0);
  });
});
```

## Step 5: Rollout Plan

### Phase 1: Core Package (Week 1)
- [x] Create database adapter interface
- [x] Implement SQLite adapter
- [x] Implement PostgreSQL adapter
- [x] Create service layer
- [x] Add unit tests

### Phase 2: MCP Migration (Week 2)
- [ ] Extract tool definitions from registry.ts
- [ ] Refactor src/index.ts to use core package
- [ ] Refactor src/http-server.ts to use core package
- [ ] Update package.json dependencies
- [ ] Run integration tests (136 tests should still pass)

### Phase 3: REST API Integration (Week 2)
- [ ] Update REST API to use RegulationsService
- [ ] Test with PostgreSQL
- [ ] Deploy to staging

### Phase 4: Testing & Validation (Week 3)
- [ ] MCP users test (SQLite path)
- [ ] Teams pilot users test (PostgreSQL path)
- [ ] Load testing (concurrent requests)
- [ ] Performance comparison (SQLite vs PostgreSQL)

### Phase 5: Release (Week 4)
- [ ] Tag v0.5.0
- [ ] Publish to npm
- [ ] Submit Teams extension to marketplace
- [ ] Update documentation

## Backward Compatibility Guarantees

1. **MCP users see zero changes** - SQLite path is default
2. **No breaking API changes** - Tool interfaces remain identical
3. **Database migration is optional** - Only needed for Teams integration
4. **Performance parity** - SQLite queries match v0.4.1 performance

## Rollback Plan

If issues arise:

1. **Git revert** - v0.4.1 tag is permanent
2. **npm downgrade** - `npm install @ansvar/eu-regulations-mcp@0.4.1`
3. **Separate packages** - MCP and REST API can be versioned independently

## Questions & Answers

**Q: Do existing MCP users need to do anything?**
A: No. They continue using SQLite exactly as before.

**Q: Can I use PostgreSQL with the MCP server?**
A: Yes! Set `DATABASE_URL` environment variable before starting.

**Q: What if PostgreSQL is down?**
A: MCP server falls back to SQLite if DATABASE_URL is not set.

**Q: Does this change the npm package structure?**
A: Yes, but transparently. The main export `npx eu-regulations-mcp` works identically.

**Q: When is this shipping?**
A: Target: Q2 2026 (after v0.4.1 validation period)
