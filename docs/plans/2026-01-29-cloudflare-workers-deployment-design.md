# Cloudflare Workers Deployment Design

**Date:** 2026-01-29
**Status:** Approved
**Goal:** Deploy EU Compliance MCP server to Cloudflare Workers free tier for global edge distribution

## Use Case

Make the MCP server accessible to GitHub Copilot and ChatGPT users globally with low latency. Target audience is compliance professionals, developers, and AI assistants needing to query EU regulations.

## Architecture Overview

### High-Level Flow
```
ChatGPT/Copilot → Cloudflare Workers (Edge) → Neon PostgreSQL → Response
                        ↓
                  Rate Limiter (IP-based)
```

### Components

1. **Cloudflare Worker** (Edge Runtime)
   - Handles MCP protocol over HTTP (adapt existing `http-server.ts`)
   - Runs globally at 300+ edge locations
   - Enforces rate limiting per IP (100 requests/hour)
   - Connects to Neon via standard PostgreSQL client

2. **Neon PostgreSQL** (Database)
   - Migrated 18MB regulations database
   - Accessible via standard PostgreSQL connection
   - Supports connection pooling for edge functions
   - Free tier: 512MB database, 3GB storage, unlimited requests

3. **Rate Limiting Layer**
   - Built into Worker code (no external service)
   - Simple in-memory tracking (resets on Worker restart - acceptable)
   - Returns HTTP 429 when limit exceeded
   - Configurable threshold via environment variable

## Key Design Decisions

### Database Strategy: PostgreSQL (Portable)

**Why not Cloudflare D1?**
- Avoids vendor lock-in
- Works with any edge platform (Vercel Edge, Deno Deploy, etc.)
- Standard PostgreSQL = easy to move providers
- Already have migration tooling (`migrate:postgres` script)

**Why Neon?**
- Serverless PostgreSQL designed for edge functions
- HTTP connection mode (no TCP pooling issues in Workers)
- Auto-scales to zero when idle
- Most generous free tier for this use case

### Rate Limiting Strategy: Simple & Sufficient

**Approach:** IP-based, in-memory tracking
- 100 requests/hour per IP (enough for legitimate research)
- Resets on Worker restart (acceptable trade-off for simplicity)
- No external KV storage needed (keep it simple)

**Why this is sufficient:**
- Cloudflare free tier: 100k requests/day across all traffic
- Rate limiting prevents single actors from burning quota
- If limits hit consistently → $5/month paid plan = 10M requests
- Heavy users can self-host using npm package

**No API keys needed:**
- Reduces friction for ChatGPT/Copilot integration
- Public compliance data should be accessible
- Rate limits provide abuse protection

## Implementation Changes

### 1. Database Layer Migration

**From:** `better-sqlite3` (SQLite)
**To:** `pg` (PostgreSQL client)

**Query Adaptations:**
- Placeholders: `?` → `$1, $2, $3`
- Case-insensitive search: `LIKE` → `ILIKE`
- FTS5 queries: Minimal changes (PostgreSQL has `ts_vector` equivalent)

**Example:**
```typescript
// Before (SQLite)
import Database from 'better-sqlite3';
const db = new Database(DB_PATH, { readonly: true });
const stmt = db.prepare('SELECT * FROM articles WHERE title LIKE ?');

// After (PostgreSQL)
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const result = await pool.query('SELECT * FROM articles WHERE title ILIKE $1', [query]);
```

### 2. Rate Limiting Middleware

**New file:** `src/middleware/rate-limit.ts`

```typescript
const ipCounts = new Map<string, { count: number, resetAt: number }>();

export function checkRateLimit(ip: string, limit: number): boolean {
  const now = Date.now();
  const record = ipCounts.get(ip);

  if (!record || now > record.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + 3600000 }); // 1 hour
    return true;
  }

  if (record.count >= limit) {
    return false; // Rate limit exceeded
  }

  record.count++;
  return true;
}
```

### 3. Cloudflare Worker Entry Point

**New file:** `wrangler.toml`

```toml
name = "eu-regulations-mcp"
main = "dist/worker.js"
compatibility_date = "2024-01-01"

[env.production]
vars = { RATE_LIMIT_PER_HOUR = "100" }

[[env.production.secrets]]
# Set via: wrangler secret put DATABASE_URL
# Value: postgresql://user:pass@host.neon.tech/regulations
```

**Adapt:** `src/http-server.ts` → `src/worker.ts`

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Rate limit check
    if (!checkRateLimit(clientIP, env.RATE_LIMIT_PER_HOUR)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Retry-After': '3600' }
      });
    }

    // Existing MCP handling logic...
  }
}
```

### 4. Existing Code to Keep

**No changes needed:**
- All MCP tool implementations (`src/tools/*.ts`)
- Tool registry system (`src/tools/registry.ts`)
- MCP SDK integration
- Tool logic (search, get_article, compare, etc.)

## Data Flow - Request Lifecycle

### 1. Incoming Request
```
POST /mcp
Headers: { "mcp-session-id": "abc123", "CF-Connecting-IP": "203.0.113.42" }
Body: { "method": "tools/call", "params": { "name": "search_regulations", ... } }
```

### 2. Rate Limit Check
- Extract client IP from `CF-Connecting-IP` header (Cloudflare-provided)
- Check in-memory map: requests in past hour < 100?
- If exceeded: Return HTTP 429 with `Retry-After: 3600`

### 3. MCP Protocol Handling
- Existing `StreamableHTTPServerTransport` processes request
- Routes to appropriate tool handler (e.g., `search_regulations`)
- Tool executes PostgreSQL query via connection pool

### 4. Database Query
```typescript
const result = await pool.query(
  `SELECT article_number, regulation, snippet
   FROM articles_fts
   WHERE articles_fts MATCH $1
   LIMIT $2`,
  [query, limit]
);
```

### 5. Response
```json
{
  "result": [...articles],
  "isError": false
}
```

### Cold Start Behavior
- First request to a region: ~200-500ms (Worker init + DB connection)
- Subsequent requests: ~50-150ms (connection pooled)
- Neon keeps DB "warm" if queried regularly

## Error Handling & Resilience

### Database Connection Failures

```typescript
try {
  const result = await pool.query(sql, params);
  return result.rows;
} catch (error) {
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    // Database unreachable - return 503
    return new Response(JSON.stringify({
      error: 'Database temporarily unavailable',
      retryable: true
    }), { status: 503 });
  }

  // Query error - return 500
  console.error('Query failed:', error);
  return new Response(JSON.stringify({
    error: 'Internal server error',
    retryable: false
  }), { status: 500 });
}
```

### Rate Limit Edge Cases

- **Missing IP header:** Default to permissive limit or reject
- **Clock skew:** Use relative timestamps, not absolute wall time
- **Memory overflow:** LRU eviction if IP map grows >10,000 entries

### Graceful Degradation

- **Neon down:** Return cached error response (don't spam database)
- **CPU exceeded:** Log slow query for optimization
- **Memory pressure:** Close idle database connections

### Monitoring Strategy

- **Cloudflare Workers Analytics** (built-in, free)
- Track: request count, error rate, P50/P95 latency, rate limit hits
- Alerts: Email if error rate >5% or latency >1s

### Health Check Endpoint

```typescript
if (url.pathname === '/health') {
  const dbOk = await pool.query('SELECT 1').catch(() => false);
  return new Response(JSON.stringify({
    status: dbOk ? 'healthy' : 'degraded',
    database: dbOk ? 'connected' : 'unreachable'
  }), { status: dbOk ? 200 : 503 });
}
```

## Deployment Steps

### 1. Database Migration

```bash
# Create Neon account (free tier)
# Get DATABASE_URL from Neon dashboard

# Run existing migration script
npm run migrate:postgres
# (Set DATABASE_URL environment variable first)
```

### 2. Cloudflare Setup

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Set database connection secret
wrangler secret put DATABASE_URL
# Paste: postgresql://user:pass@host.neon.tech/regulations
```

### 3. Deploy Worker

```bash
# Build TypeScript
npm run build

# Deploy to Cloudflare
wrangler deploy
# Returns: https://eu-regulations-mcp.your-subdomain.workers.dev
```

### 4. Test Deployment

```bash
# Health check
curl https://eu-regulations-mcp.your-subdomain.workers.dev/health

# MCP request
curl -X POST https://eu-regulations-mcp.your-subdomain.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/list"}'
```

## Cost Analysis

### Free Tier Limits

**Cloudflare Workers:**
- 100,000 requests/day
- 10ms CPU time per request
- 128MB memory
- No bandwidth costs

**Neon PostgreSQL:**
- 512MB database (current: 18MB - plenty of room)
- 3GB storage
- Unlimited requests
- Auto-scales to zero

### When to Upgrade

**Cloudflare:** If you consistently hit 100k requests/day
- Cost: $5/month = 10M requests
- Unlikely unless viral adoption

**Neon:** If database grows >512MB
- Cost: $19/month = 10GB storage
- Unlikely with current dataset

### Escape Hatches

1. **Hit rate limits?** Add optional API keys for power users (bypass limits)
2. **Too expensive?** Point users to self-hosted npm package
3. **Cloudflare-specific issues?** Redeploy to Vercel Edge/Deno Deploy (same code, just change platform)

## Testing Strategy

### Local Testing

```bash
# Run migrations locally against test Neon instance
DATABASE_URL=postgresql://... npm run migrate:postgres

# Run Worker locally with Wrangler
wrangler dev
# Test at http://localhost:8787
```

### Integration Tests

```typescript
// tests/worker.test.ts
describe('Cloudflare Worker', () => {
  it('enforces rate limits', async () => {
    // Make 101 requests from same IP
    // Expect 429 on 101st request
  });

  it('handles database errors gracefully', async () => {
    // Mock database failure
    // Expect 503 response
  });
});
```

### Load Testing

```bash
# Use Apache Bench or similar
ab -n 1000 -c 10 https://eu-regulations-mcp.workers.dev/health
```

## Future Enhancements

### Phase 2 (if needed)
- **API keys:** Add optional auth for power users
- **Analytics dashboard:** Track popular queries, regulations
- **Caching layer:** Cloudflare Cache API for frequent queries
- **WebSocket support:** For long-running sessions

### Phase 3 (if scaling)
- **Multi-region failover:** Primary/replica Neon instances
- **GraphQL layer:** Alternative to MCP for web clients
- **Admin panel:** View usage stats, manage rate limits

## Success Metrics

- **Latency:** P95 < 300ms globally
- **Availability:** >99.5% uptime
- **Cost:** Stay within free tier for first 6 months
- **Adoption:** >100 unique IPs/day within 3 months

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Exceed free tier | $5-25/month cost | Rate limiting + monitoring alerts |
| Database outage | Service unavailable | Health checks + fallback error messages |
| Cloudflare changes pricing | Lock-in risk | Portable PostgreSQL design |
| Abuse/spam | Quota exhaustion | IP-based rate limits |
| Cold start latency | Poor UX | Accept trade-off (serverless benefit) |

## Open Questions

- [ ] Domain name for Workers deployment? (e.g., `api.ansvar.eu` vs `*.workers.dev`)
- [ ] ChatGPT/Copilot integration documentation location?
- [ ] Monitoring: Email alerts vs Slack vs Discord?

---

**Next Steps:**
1. Create Neon account and run database migration
2. Set up Cloudflare Workers project
3. Implement rate limiting middleware
4. Adapt http-server.ts to Worker format
5. Deploy and test
