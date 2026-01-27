# EU Regulations REST API

REST API for Microsoft Teams/Copilot integration.

## Features

- **Microsoft Entra ID authentication** - JWT token validation
- **Rate limiting** - Per-tenant limits (100 req/min)
- **PostgreSQL** - Scalable database with connection pooling
- **Security** - Helmet.js, CORS, request logging
- **Health checks** - `/health` endpoint for monitoring

## Development

```bash
# Install dependencies
npm install

# Set environment variables
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/eu_regulations"
export AZURE_CLIENT_ID="your-app-id"
export SKIP_AUTH="true"           # Development only
export SKIP_RATE_LIMIT="true"     # Development only

# Run development server
npm run dev

# Test health check
curl http://localhost:3000/health

# Test search (with dev auth)
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token" \
  -d '{"query": "incident reporting", "limit": 5}'
```

## Production

```bash
# Build
npm run build

# Run
export DATABASE_URL="postgresql://..."
export AZURE_CLIENT_ID="..."
export NODE_ENV="production"
npm start
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AZURE_CLIENT_ID` | Yes | Entra ID app client ID |
| `AZURE_TENANT_ID` | No | Tenant ID (default: common) |
| `ALLOWED_TENANTS` | No | Comma-separated tenant IDs |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (development/production) |
| `SKIP_AUTH` | No | Skip auth in development |
| `SKIP_RATE_LIMIT` | No | Skip rate limits in development |

## API Endpoints

### `GET /health`
Health check (no auth required)

### `POST /api/search`
Search across all regulations

**Body:**
```json
{
  "query": "incident reporting",
  "regulations": ["DORA", "NIS2"],
  "limit": 10
}
```

### `GET /api/articles/:regulation/:number`
Get a specific article

**Example:** `/api/articles/GDPR/17`

### `GET /api/articles/:regulation`
List all articles for a regulation

**Example:** `/api/articles/NIS2`

## Authentication

All `/api/*` endpoints require a valid Microsoft Entra ID JWT token:

```
Authorization: Bearer <jwt-token>
```

The token must:
- Be signed by Microsoft
- Have `aud` matching `AZURE_CLIENT_ID`
- Have valid `iss` (issuer)
- Not be expired

## Rate Limiting

- **General API**: 100 requests/minute per tenant
- **Search**: 30 requests/minute per tenant

Rate limits are per organization (tenant), not per user.

## Deployment

See `docs/postgres-setup.md` for database setup.

Deploy to:
- Azure Container Apps
- AWS ECS/Fargate
- Google Cloud Run
- DigitalOcean App Platform

Container image: `docker build -t eu-regs-api .`
