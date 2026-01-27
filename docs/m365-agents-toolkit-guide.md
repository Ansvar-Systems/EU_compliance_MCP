# Microsoft 365 Agents Toolkit Integration Guide

## Overview

**Path A: Declarative Agent with MCP** - The cleanest integration path for Microsoft-heavy organizations. The toolkit auto-discovers your MCP tools and generates all the wiring.

## Prerequisites

- ✅ MCP server hosted remotely (Azure Container Apps)
- ✅ HTTPS endpoint with valid SSL
- ✅ OAuth 2.0 or API key authentication
- ✅ 10 MCP tools exposed

**We have all of this ready!**

## Workflow

```
1. Host MCP Server on Azure
   ↓
2. Open VS Code with Agents Toolkit
   ↓
3. Point to MCP endpoint
   ↓
4. Toolkit introspects and generates manifest
   ↓
5. Deploy to M365 tenant
   ↓
6. Users access via Copilot
```

## Step-by-Step: Agents Toolkit

### 1. Install Microsoft 365 Agents Toolkit

**In VS Code:**
1. Open Extensions (Cmd+Shift+X)
2. Search "Microsoft 365 Agents Toolkit"
3. Click Install
4. Sign in with M365 account

**Or via CLI:**
```bash
npm install -g @microsoft/teamsfx-cli
```

### 2. Create New Declarative Agent Project

**In VS Code:**
1. Press `Cmd+Shift+P`
2. Type "Teams: Create New App"
3. Select "Declarative Agent"
4. Choose "MCP Server" as data source
5. Enter MCP endpoint: `https://eu-regulations-mcp.azurecontainerapps.io`

**The toolkit will:**
- Connect to your MCP server
- Discover all 10 tools via `/mcp/list`
- Generate manifest with tool schemas
- Create conversation starters
- Package app bundle

### 3. Configure MCP Connection

**Edit `.env`:**
```bash
# MCP Server endpoint (your deployed Azure Container Apps URL)
MCP_SERVER_URL=https://eu-regulations-mcp.azurecontainerapps.io

# Authentication (choose one)
MCP_AUTH_TYPE=azure-ad
AZURE_CLIENT_ID=<your-client-id>
AZURE_TENANT_ID=<your-tenant-id>

# Or use API key
MCP_AUTH_TYPE=api-key
MCP_API_KEY=<your-api-key>
```

### 4. Auto-Generated Manifest

**The toolkit creates `declarativeAgent.json`:**

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.0/schema.json",
  "version": "v1.0",
  "name": "EU Compliance Advisor",
  "description": "Expert on 37 EU regulations with full-text search and compliance mapping",

  "instructions": "You are an expert on EU cybersecurity and data protection regulations...",

  "capabilities": [
    {
      "name": "search_regulations",
      "description": "Search across 2,278 articles from 37 EU regulations",
      "mcp_tool": "search_regulations"
    },
    {
      "name": "get_article",
      "description": "Retrieve specific articles with full text",
      "mcp_tool": "get_article"
    }
    // ... 8 more tools auto-discovered
  ],

  "mcp": {
    "server": {
      "url": "https://eu-regulations-mcp.azurecontainerapps.io",
      "authentication": {
        "type": "azure-ad",
        "clientId": "${AZURE_CLIENT_ID}",
        "tenantId": "${AZURE_TENANT_ID}"
      }
    }
  }
}
```

**Key point:** You don't write this manually! The toolkit generates it from your MCP server's tool definitions.

### 5. Test Locally

**In VS Code:**
1. Press `F5` (Start Debugging)
2. Toolkit launches local Copilot simulator
3. Test conversation starters:
   - "What are the incident reporting requirements under NIS2?"
   - "Show me GDPR Article 17"
   - "Which regulations apply to financial institutions?"

**Verify:**
- All 10 tools respond correctly
- Authentication works
- Error handling is graceful
- Response times are acceptable

### 6. Deploy to M365 Tenant

**Option A: Via VS Code**
1. Right-click `declarativeAgent.json`
2. Select "Deploy to Teams Admin Center"
3. Toolkit uploads app package
4. Approve in admin center

**Option B: Via CLI**
```bash
# Build app package
teamsfx build

# Deploy to tenant
teamsfx deploy \
  --env production \
  --tenant-id <your-tenant-id>
```

**Option C: Manual Upload**
1. Toolkit generates `.zip` package in `build/`
2. Go to Teams Admin Center
3. Upload custom app
4. Approve for organization

### 7. User Access

**Users can now:**
1. Open Microsoft Copilot
2. Type `@EU Compliance Advisor`
3. Ask natural language questions
4. Get responses with article citations

**Example conversation:**
```
User: @EU Compliance Advisor What are the incident reporting
      requirements under NIS2?

Agent: Under NIS2, significant incidents must be reported within
       24 hours. Here are the key requirements:

       **NIS2 Article 23 - Reporting obligations**
       1. Early warning within 24 hours
       2. Incident notification within 72 hours
       3. Final report within 1 month

       Related articles:
       - Article 23: Detailed reporting timeline
       - Article 6: Definition of significant incident

       Would you like me to show the full text of Article 23?
```

## Auto-Discovery: How It Works

When you point the toolkit at your MCP server, it calls:

**1. List tools:**
```bash
GET https://mcp.ansvar.ai/mcp/list

Response:
{
  "tools": [
    {
      "name": "search_regulations",
      "description": "Search across articles and recitals...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {"type": "string"},
          "regulations": {"type": "array"},
          "limit": {"type": "integer"}
        },
        "required": ["query"]
      }
    },
    // ... 9 more tools
  ]
}
```

**2. For each tool, toolkit generates:**
- Capability definition
- Input validation schema
- Output format
- Error handling
- Example usage

**3. Generates conversation starters:**
Based on tool descriptions and common use cases:
- "What are the incident reporting requirements under NIS2?"
- "Show me GDPR Article 17"
- "Which regulations apply to financial institutions?"
- "Map ISO 27001 control A.5.1 to regulations"

## Advantages of MCP Path

**vs. REST API path:**
| Feature | MCP Path | REST API Path |
|---------|----------|---------------|
| Auto-discovery | ✅ Yes | ❌ Manual mapping |
| Tool updates | ✅ Auto-sync | ❌ Update manifest |
| Type safety | ✅ MCP schemas | ⚠️ OpenAPI conversion |
| Debugging | ✅ MCP inspector | ⚠️ HTTP logs |
| Versioning | ✅ MCP protocol | ❌ API versioning |
| Streaming | ✅ SSE native | ⚠️ Custom impl |

**Result:** Less manual work, fewer bugs, faster iteration.

## Architecture Diagram

```
┌─────────────────────────┐
│  Microsoft 365 Copilot  │
│  (User Interface)       │
└────────────┬────────────┘
             │
             │ Declarative Agent invokes MCP tool
             │
             ▼
┌─────────────────────────────────────────┐
│  Microsoft 365 Agents Toolkit           │
│  - Discovers tools from MCP server      │
│  - Handles auth (Azure AD)              │
│  - Validates inputs/outputs             │
│  - Manages errors                       │
└────────────┬────────────────────────────┘
             │
             │ MCP-over-HTTP (SSE)
             │
             ▼
┌─────────────────────────────────────────┐
│  Azure Container Apps                    │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  MCP Server (HTTP mode)            │ │
│  │  - 10 tools exposed                │ │
│  │  - OAuth 2.0 auth                  │ │
│  │  - SSE streaming                   │ │
│  └────────────┬───────────────────────┘ │
│               │                          │
│  ┌────────────▼───────────────────────┐ │
│  │  Core Package                      │ │
│  │  - DatabaseAdapter (PostgreSQL)    │ │
│  │  - RegulationsService              │ │
│  └────────────┬───────────────────────┘ │
│               │                          │
└───────────────┼──────────────────────────┘
                │
                ▼
       ┌─────────────────┐
       │   PostgreSQL    │
       │   (Azure DB)    │
       └─────────────────┘
```

## What You Need to Do

**Week 1: Deploy MCP Server to Azure**
```bash
# 1. Build container
docker build -t euregsmcp.azurecr.io/mcp-server:latest .

# 2. Push to registry
docker push euregsmcp.azurecr.io/mcp-server:latest

# 3. Deploy to Container Apps
az containerapp create \
  --name eu-regulations-mcp \
  --resource-group eu-regulations-rg \
  --environment eu-regulations-env \
  --image euregsmcp.azurecr.io/mcp-server:latest \
  --env-vars MCP_HTTP_PORT=3000 \
  --ingress external

# 4. Get URL
az containerapp show \
  --name eu-regulations-mcp \
  --query properties.configuration.ingress.fqdn
```

**Week 2: Use Agents Toolkit**
```
1. Install toolkit in VS Code
2. Create new Declarative Agent project
3. Point to: https://eu-regulations-mcp.azurecontainerapps.io
4. Let toolkit discover 10 tools
5. Test locally (F5)
6. Deploy to tenant
```

**Week 3: Marketing**
- List on PulseMCP: "Remote MCP server for EU regulations"
- LinkedIn post: "Now integrated with M365 Copilot"
- Blog: "From MCP to Microsoft 365 in 3 weeks"

## Cost

**Same as before: ~€100/month**
- Container Apps: €40
- PostgreSQL: €60
- No additional cost for Agents Toolkit integration!

## Key Resources

- [Declarative Agents with MCP](https://learn.microsoft.com/microsoft-365-copilot/extensibility/declarative-agent-mcp)
- [Microsoft 365 Agents Toolkit](https://aka.ms/agents-toolkit)
- [MCP Protocol Spec](https://modelcontextprotocol.io)
- [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/)

## Success Path

**What makes this work:**
1. **MCP as source of truth** - One server, multiple interfaces
2. **Auto-discovery** - Toolkit generates manifest from your tools
3. **Native integration** - Copilot understands MCP semantics
4. **Zero maintenance** - Update server, manifest auto-updates
5. **Type safety** - MCP schemas prevent integration bugs

**You've already built the hard part** (37 regulations, PostgreSQL adapter, 10 MCP tools). The toolkit just wraps it for M365 Copilot.

## Next Step

Want me to:
1. **Create the Dockerfile** for Azure Container Apps?
2. **Write the GitHub Actions workflow** for CI/CD?
3. **Generate conversation starters** optimized for compliance teams?
4. **Create Azure deployment script** (one command to deploy everything)?

Which would be most helpful for Week 1 deployment?
