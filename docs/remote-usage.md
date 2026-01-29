# Using the Remote EU Regulations API

The EU Regulations MCP server is deployed at:
**https://eu-regulations-mcp.jeffreyrotz.workers.dev**

## Quick Start

All requests must include an `Origin` header with an allowed domain:
- `https://chatgpt.com`
- `https://chat.openai.com`
- `https://copilot-proxy.githubusercontent.com`
- `https://github.com`

## Available Endpoints

### 1. Health Check
```bash
curl https://eu-regulations-mcp.jeffreyrotz.workers.dev/health \
  -H "Origin: https://chatgpt.com"
```

**Response:**
```json
{
  "status": "healthy",
  "server": "eu-regulations-mcp",
  "version": "0.6.5",
  "database": "connected",
  "timestamp": "2026-01-29T10:15:00.000Z"
}
```

### 2. List Available Tools
```bash
curl https://eu-regulations-mcp.jeffreyrotz.workers.dev/tools \
  -H "Origin: https://chatgpt.com"
```

**Response:** Array of 9 tools with their schemas

### 3. Execute Tools
```bash
curl https://eu-regulations-mcp.jeffreyrotz.workers.dev/api/tool \
  -H "Origin: https://chatgpt.com" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_regulations",
    "params": {
      "query": "incident reporting",
      "limit": 5
    }
  }'
```

## ChatGPT Integration

### Option 1: Custom GPT

1. Go to https://chatgpt.com
2. Create a new GPT
3. Configure Actions:
   - **Schema URL:** `https://eu-regulations-mcp.jeffreyrotz.workers.dev/tools`
   - **Authentication:** None (public API)
   - **Server URL:** `https://eu-regulations-mcp.jeffreyrotz.workers.dev`

4. Add this system prompt:
   ```
   You are an EU regulations compliance assistant. Use the search_regulations 
   tool to find relevant articles, get_article to retrieve full text, and 
   check_applicability to determine which regulations apply to organizations.
   ```

### Option 2: ChatGPT Custom Actions

Add these actions to your ChatGPT workspace:

```yaml
openapi: 3.0.0
info:
  title: EU Regulations API
  version: 0.6.5
servers:
  - url: https://eu-regulations-mcp.jeffreyrotz.workers.dev
paths:
  /api/tool:
    post:
      operationId: executeTool
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                tool:
                  type: string
                  enum: [search_regulations, get_article, get_recital, list_regulations, 
                         get_definitions, check_applicability, map_controls, 
                         compare_requirements, get_evidence_requirements]
                params:
                  type: object
      responses:
        '200':
          description: Tool execution result
```

## GitHub Copilot Integration

### Using Copilot Chat

Ask Copilot to use the API:
```
@workspace Search EU regulations for "data breach notification" using 
https://eu-regulations-mcp.jeffreyrotz.workers.dev/api/tool
```

### Using Copilot Extensions

Create a `.github/copilot-instructions.md`:
```markdown
# EU Regulations API

When asked about EU compliance or regulations, use:
https://eu-regulations-mcp.jeffreyrotz.workers.dev/api/tool

Example tools:
- search_regulations: Find articles by keyword
- get_article: Get full article text
- check_applicability: Determine which regulations apply
```

## Rate Limiting

- **Limit:** 100 requests per hour per IP
- **Headers:** All responses include rate limit info:
  ```
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 95
  X-RateLimit-Reset: 1738238400
  ```

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request - Invalid parameters |
| 403 | Forbidden - Invalid origin |
| 404 | Not Found - Invalid tool or endpoint |
| 413 | Payload Too Large - Request over 100KB |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Database timeout |

## Example: Search and Retrieve

```bash
# 1. Search for articles
curl https://eu-regulations-mcp.jeffreyrotz.workers.dev/api/tool \
  -H "Origin: https://chatgpt.com" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_regulations",
    "params": {"query": "GDPR data protection", "limit": 3}
  }'

# 2. Get full article
curl https://eu-regulations-mcp.jeffreyrotz.workers.dev/api/tool \
  -H "Origin: https://chatgpt.com" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "get_article",
    "params": {"regulation": "GDPR", "article": "17"}
  }'

# 3. Check applicability
curl https://eu-regulations-mcp.jeffreyrotz.workers.dev/api/tool \
  -H "Origin: https://chatgpt.com" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "check_applicability",
    "params": {"sector": "financial", "detail_level": "summary"}
  }'
```

## Support

- **Issues:** https://github.com/ansvar-ai/eu-regulations-mcp/issues
- **Documentation:** https://github.com/ansvar-ai/eu-regulations-mcp
- **API Reference:** https://eu-regulations-mcp.jeffreyrotz.workers.dev/
