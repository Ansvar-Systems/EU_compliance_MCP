# EU Regulations HTTP API

This is a **simplified HTTP API** for direct access to EU cybersecurity regulations, designed for AI assistants like ChatGPT and GitHub Copilot.

## Architecture Decision

This implementation provides a **REST-style HTTP API** rather than the full MCP (Model Context Protocol) protocol. This design choice prioritizes simplicity and direct client access over protocol compliance.

### Why Not Full MCP Protocol?

The user's goal is "for copilot and chatgpt" — direct HTTP access from AI assistants. Implementing the full MCP protocol would require:
- WebSocket or SSE connections
- Protocol message framing
- Client-side MCP SDK integration
- More complexity for the same end result

Instead, we provide a simple POST endpoint that accepts tool names and parameters directly.

## API Endpoints

### GET /

API documentation and usage examples (this information).

```bash
curl https://your-worker.workers.dev/
```

### GET /health

Health check endpoint. Tests database connectivity.

**Response:**
```json
{
  "status": "healthy",
  "server": "eu-regulations-mcp",
  "version": "0.6.5",
  "database": "connected",
  "timestamp": "2026-01-29T10:00:00Z"
}
```

### GET /tools

List all available tools with their schemas. Use this for discovery.

**Response:**
```json
{
  "tools": [
    {
      "name": "search_regulations",
      "description": "Search across all EU regulations...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "..." },
          "regulations": { "type": "array", "items": { "type": "string" } },
          "limit": { "type": "number" }
        },
        "required": ["query"]
      }
    }
    // ... 8 more tools
  ],
  "count": 9,
  "timestamp": "2026-01-29T10:00:00Z"
}
```

### POST /api/tool

Execute a tool by name with parameters.

**Request:**
```json
{
  "tool": "search_regulations",
  "params": {
    "query": "incident reporting",
    "limit": 10
  }
}
```

**Success Response (200):**
```json
{
  "result": [
    {
      "regulation": "DORA",
      "article": "17",
      "title": "Incident reporting",
      "snippet": "Financial entities shall report major >>>incident<<< within...",
      "relevance": 2.47,
      "type": "article"
    }
    // ... more results
  ],
  "timestamp": "2026-01-29T10:00:00Z"
}
```

**Error Response (400/500):**
```json
{
  "error": "Unknown tool",
  "message": "Tool 'invalid_name' not found"
}
```

**Rate Limit Response (429):**
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again later.",
  "retryAfter": 3456,
  "resetAt": "2026-01-29T11:00:00Z"
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_regulations` | Search across all regulations (FTS5, 32-token snippets) |
| `get_article` | Get full text of specific article (500-70K tokens, truncated at 50K chars) |
| `get_recital` | Get full text of specific recital (context for articles) |
| `list_regulations` | List all regulations or get structure of one regulation |
| `compare_requirements` | Compare how multiple regulations address a topic |
| `map_controls` | Map ISO 27001/NIST CSF controls to regulation articles |
| `check_applicability` | Determine which regulations apply to an organization |
| `get_definitions` | Look up official term definitions |
| `get_evidence_requirements` | Get compliance evidence/audit artifacts needed |

See `GET /tools` for full schemas.

## Rate Limiting

- **Limit:** 100 requests per hour per IP address
- **Headers:**
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 73`
  - `X-RateLimit-Reset: 2026-01-29T11:00:00Z`
- **429 Response:** Includes `Retry-After` header (seconds)

## CORS

Allowed origins:
- `https://chat.openai.com`
- `https://chatgpt.com`
- `https://copilot.microsoft.com`
- `https://github.com`

Preflight requests (OPTIONS) are supported.

## Example Usage

### cURL

```bash
# List available tools
curl https://your-worker.workers.dev/tools

# Search for incident reporting requirements
curl -X POST https://your-worker.workers.dev/api/tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_regulations",
    "params": {
      "query": "incident reporting",
      "regulations": ["GDPR", "NIS2", "DORA"],
      "limit": 5
    }
  }'

# Get GDPR Article 33 (data breach notification)
curl -X POST https://your-worker.workers.dev/api/tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "get_article",
    "params": {
      "regulation": "GDPR",
      "article": "33"
    }
  }'

# Check which regulations apply to a bank
curl -X POST https://your-worker.workers.dev/api/tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "check_applicability",
    "params": {
      "sector": "financial",
      "subsector": "bank",
      "size": "large"
    }
  }'
```

### JavaScript

```javascript
// List tools
const tools = await fetch('https://your-worker.workers.dev/tools')
  .then(r => r.json());

console.log(`Available tools: ${tools.count}`);

// Execute search
const response = await fetch('https://your-worker.workers.dev/api/tool', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tool: 'search_regulations',
    params: {
      query: 'data breach notification',
      limit: 10
    }
  })
});

const data = await response.json();

if (response.ok) {
  console.log('Search results:', data.result);
} else {
  console.error('Error:', data.error, data.message);
}
```

### Python

```python
import requests

# List tools
tools = requests.get('https://your-worker.workers.dev/tools').json()
print(f"Available tools: {tools['count']}")

# Execute search
response = requests.post(
    'https://your-worker.workers.dev/api/tool',
    json={
        'tool': 'search_regulations',
        'params': {
            'query': 'risk assessment',
            'regulations': ['DORA', 'NIS2'],
            'limit': 5
        }
    }
)

if response.ok:
    results = response.json()['result']
    for result in results:
        print(f"{result['regulation']} Art. {result['article']}: {result['title']}")
else:
    error = response.json()
    print(f"Error: {error['error']} - {error['message']}")
```

## Deployment

See [deployment-guide.md](./deployment-guide.md) for:
- Cloudflare Workers setup
- Neon PostgreSQL configuration
- Environment variables
- Custom domain setup

## Comparison with Standard MCP Server

| Feature | This HTTP API | Standard MCP Server |
|---------|---------------|---------------------|
| **Protocol** | REST HTTP | MCP (stdio/SSE) |
| **Transport** | POST /api/tool | stdio pipes or SSE |
| **Discovery** | GET /tools | MCP list_tools |
| **Execution** | POST with tool + params | MCP call_tool |
| **Use Case** | Direct HTTP clients (ChatGPT, Copilot) | MCP-aware clients (Claude Desktop, IDEs) |
| **Setup** | Single HTTP endpoint | MCP client integration |
| **Rate Limiting** | IP-based (100/hour) | N/A (local) |
| **Database** | PostgreSQL (Neon) | SQLite (local file) |

The standard MCP server (for Claude Desktop) is still available via:
```bash
npx -y @ansvar-systems/eu-compliance-mcp
```

This HTTP API complements it by enabling remote access from web-based AI assistants.

## Error Codes

| Status | Error Type | Meaning |
|--------|------------|---------|
| 400 | Unknown tool | Tool name not recognized |
| 400 | Bad Request | Invalid JSON or missing required params |
| 404 | Not found | Invalid endpoint path |
| 405 | Method not allowed | Wrong HTTP method for endpoint |
| 429 | Rate limit exceeded | Too many requests from IP |
| 500 | Internal server error | Database or execution error |
| 503 | Service unavailable | Database connection failed (health check) |

## Security Considerations

1. **Rate Limiting:** 100 requests/hour per IP prevents abuse
2. **CORS:** Only allows requests from approved AI assistant origins
3. **No Authentication:** Public API for read-only regulation access
4. **Database:** PostgreSQL credentials stored in Cloudflare Worker secrets
5. **No PII:** Regulation content is public domain (EUR-Lex)

For production use, consider:
- Adding authentication (API keys)
- Custom rate limits per client
- Request logging and monitoring
- DDoS protection (Cloudflare includes basic protection)

## Monitoring

Rate limit headers on every response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 2026-01-29T11:00:00Z
```

Health check endpoint:
```bash
curl https://your-worker.workers.dev/health
```

Cloudflare dashboard provides:
- Request analytics
- Error rates
- Performance metrics
- Geographic distribution
