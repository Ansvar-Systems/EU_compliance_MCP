# Remote MCP Server Hosting Guide

## Overview

For Microsoft 365 integration, MCP servers **must** be hosted remotely with OAuth 2.0 or API key authentication. This guide shows how to deploy the EU Regulations MCP server to Azure Container Apps.

## Why Remote Hosting?

**Microsoft's requirement:** M365 Copilot extensions cannot use local stdio-based MCP servers. They require:
1. HTTP/HTTPS endpoint (publicly accessible)
2. OAuth 2.0 or API key authentication
3. HTTPS with valid SSL certificate

**Benefits:**
- Share MCP server across organization
- Centralized updates and maintenance
- Better security and access control
- Usage analytics and monitoring

## Architecture

```
┌─────────────────┐
│  M365 Copilot   │
│   (Client)      │
└────────┬────────┘
         │ HTTPS + OAuth
         ▼
┌─────────────────────────────────┐
│   Azure Container Apps          │
│                                 │
│  ┌──────────────────────────┐  │
│  │  MCP Server (HTTP mode)  │  │
│  │  - MCP-over-HTTP         │  │
│  │  - Azure AD auth         │  │
│  │  - 10 tools exposed      │  │
│  └──────────┬───────────────┘  │
│             │                   │
│  ┌──────────▼───────────────┐  │
│  │  REST API Layer          │  │
│  │  - OpenAPI spec          │  │
│  │  - 9 endpoints           │  │
│  └──────────┬───────────────┘  │
│             │                   │
│  ┌──────────▼───────────────┐  │
│  │  Core Package            │  │
│  │  - DatabaseAdapter       │  │
│  │  - RegulationsService    │  │
│  └──────────┬───────────────┘  │
│             │                   │
└─────────────┼───────────────────┘
              │
              ▼
     ┌─────────────────┐
     │   PostgreSQL    │
     │  (Azure DB)     │
     └─────────────────┘
```

## Implementation

### 1. Update MCP Server for HTTP Mode

Our MCP server already supports HTTP mode via the `src/http-server.ts`:

```typescript
// Already implemented in v0.4.1
if (process.env.MCP_HTTP_PORT) {
  startHttpServer(parseInt(process.env.MCP_HTTP_PORT));
}
```

**Key features:**
- SSE (Server-Sent Events) for real-time streaming
- All 10 MCP tools exposed as HTTP endpoints
- Compatible with MCP client libraries

### 2. Add Authentication Middleware

Create `src/middleware/mcp-auth.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function mcpAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Option 1: API Key (simpler)
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.MCP_API_KEY) {
    return next();
  }

  // Option 2: Azure AD JWT (recommended)
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Missing authentication' });
  }

  // Validate JWT (reuse REST API auth logic)
  validateEntraIdToken(req, res, next);
}
```

### 3. Dockerfile for MCP Server

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm@10
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm run build

# Expose MCP HTTP port
EXPOSE 3000

# Start MCP server in HTTP mode
ENV MCP_HTTP_PORT=3000
CMD ["node", "dist/index.js"]
```

### 4. Azure Container Apps Deployment

**Create `azure-deployment.yaml`:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eu-regulations-mcp
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: mcp-server
        image: euregsmcp.azurecr.io/mcp-server:latest
        env:
        - name: MCP_HTTP_PORT
          value: "3000"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-credentials
              key: connection-string
        - name: AZURE_CLIENT_ID
          value: "your-client-id"
        - name: AZURE_TENANT_ID
          value: "your-tenant-id"
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
```

### 5. Authentication Options

**Option A: API Key (Simple)**
```bash
# Generate secure API key
openssl rand -hex 32

# Set in Container Apps
az containerapp update \
  --name eu-regulations-mcp \
  --set-env-vars MCP_API_KEY=<your-key>

# Client usage
curl -H "X-API-Key: <your-key>" https://mcp.ansvar.ai/mcp/list
```

**Option B: Azure AD OAuth (Recommended)**
```bash
# Create Azure AD app registration
az ad app create \
  --display-name "EU Regulations MCP" \
  --sign-in-audience AzureADMyOrg

# Configure in Container Apps
az containerapp update \
  --name eu-regulations-mcp \
  --set-env-vars \
    AZURE_CLIENT_ID=<app-id> \
    AZURE_TENANT_ID=<tenant-id>

# Client usage (M365 Copilot handles this automatically)
# Token is obtained from Microsoft Identity Platform
```

## Deployment Steps

### Step 1: Build and Push Container

```bash
# Build multi-arch image
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t euregsmcp.azurecr.io/mcp-server:0.4.1 \
  --push .

# Tag as latest
docker tag euregsmcp.azurecr.io/mcp-server:0.4.1 \
  euregsmcp.azurecr.io/mcp-server:latest
docker push euregsmcp.azurecr.io/mcp-server:latest
```

### Step 2: Create Azure Resources

```bash
# Resource group
az group create \
  --name eu-regulations-rg \
  --location westeurope

# Container registry
az acr create \
  --name euregsmcp \
  --resource-group eu-regulations-rg \
  --sku Basic

# PostgreSQL database
az postgres flexible-server create \
  --name eu-regulations-db \
  --resource-group eu-regulations-rg \
  --location westeurope \
  --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 16

# Container Apps environment
az containerapp env create \
  --name eu-regulations-env \
  --resource-group eu-regulations-rg \
  --location westeurope
```

### Step 3: Deploy Container App

```bash
# Create container app
az containerapp create \
  --name eu-regulations-mcp \
  --resource-group eu-regulations-rg \
  --environment eu-regulations-env \
  --image euregsmcp.azurecr.io/mcp-server:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 5 \
  --cpu 0.5 \
  --memory 1Gi \
  --secrets \
    database-url=<connection-string> \
  --env-vars \
    MCP_HTTP_PORT=3000 \
    DATABASE_URL=secretref:database-url \
    AZURE_CLIENT_ID=<your-client-id> \
    AZURE_TENANT_ID=<your-tenant-id>

# Get public URL
az containerapp show \
  --name eu-regulations-mcp \
  --resource-group eu-regulations-rg \
  --query properties.configuration.ingress.fqdn
```

### Step 4: Configure Custom Domain (Optional)

```bash
# Add custom domain
az containerapp hostname add \
  --name eu-regulations-mcp \
  --resource-group eu-regulations-rg \
  --hostname mcp.ansvar.ai

# Certificate is auto-managed by Azure
```

### Step 5: Test Deployment

```bash
# Health check
curl https://mcp.ansvar.ai/health

# List MCP tools (with API key)
curl -H "X-API-Key: $MCP_API_KEY" \
  https://mcp.ansvar.ai/mcp/list

# Call MCP tool
curl -X POST https://mcp.ansvar.ai/mcp/call \
  -H "X-API-Key: $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "search_regulations",
    "arguments": {
      "query": "incident reporting",
      "limit": 3
    }
  }'
```

## Cost Estimate (Azure Container Apps)

**Production configuration:**
```
Container Apps:        €40/month (2 instances, 0.5 vCPU, 1GB RAM)
PostgreSQL Flexible:   €60/month (Standard_B1ms, 32GB storage)
Container Registry:    €5/month (Basic tier)
Bandwidth:            €10/month (estimated)
──────────────────────────────────────────────
Total:                €115/month (~€100 estimate)
```

**Scale-to-zero configuration (dev/test):**
```
Container Apps:        €5/month (scales to 0)
PostgreSQL Flexible:   €60/month (can't scale to 0)
──────────────────────────────────────────────
Total:                €65/month
```

## PulseMCP Listing

Once deployed, list on [PulseMCP](https://pulsemcp.com):

```json
{
  "name": "eu-regulations",
  "displayName": "EU Regulations Compliance",
  "description": "Search 37 EU cybersecurity & data protection regulations (GDPR, NIS2, DORA, AI Act, CRA)",
  "endpoint": "https://mcp.ansvar.ai",
  "authentication": "api-key",
  "category": "legal-compliance",
  "features": [
    "Full-text search across 2,278 articles",
    "37 regulations including GDPR, NIS2, DORA, AI Act",
    "Control framework mappings (ISO 27001, NIST CSF)",
    "Sector applicability rules",
    "3,508 recitals for context"
  ],
  "pricing": "free",
  "documentation": "https://github.com/Ansvar-Systems/EU_compliance_MCP"
}
```

## Benefits of This Architecture

1. **Single Deployment** - Both MCP and REST API from same codebase
2. **Shared Auth** - Azure AD tokens work for both interfaces
3. **Cost Efficient** - One container serves multiple protocols
4. **Easy Updates** - Push new regulations, all clients get them
5. **Analytics Ready** - Log all queries for usage insights

## Next Steps

1. **Week 1:** Add auth middleware to MCP server
2. **Week 1:** Build and test Docker image
3. **Week 1:** Deploy to Azure Container Apps
4. **Week 2:** Test with MCP clients (Claude Desktop, Cursor)
5. **Week 2:** Create Declarative Agent manifest
6. **Week 3:** Submit to M365 Copilot (if approved)
7. **Week 3:** List on PulseMCP
8. **Week 3:** Share on LinkedIn

## Security Considerations

- Use Azure AD for production (not API keys)
- Enable rate limiting per tenant
- Log all access for audit trail
- Regular security updates (automated)
- Backup database daily
- Monitor for anomalous usage

## Monitoring & Alerts

```bash
# Set up alerts
az monitor metrics alert create \
  --name high-cpu-alert \
  --resource eu-regulations-mcp \
  --condition "avg Percentage CPU > 80" \
  --window-size 5m

az monitor metrics alert create \
  --name high-error-rate \
  --resource eu-regulations-mcp \
  --condition "total Requests > 100 and total Errors > 10" \
  --window-size 5m
```

**Dashboard metrics:**
- Request count per tool
- Response time (p50, p95, p99)
- Error rate by endpoint
- Active connections
- Database query performance
