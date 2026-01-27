# 🚀 CI/CD Setup - Quick Start

## ✅ What's Already Done

1. **GitHub Actions Workflow** - `.github/workflows/deploy-azure.yml`
2. **Documentation** - `docs/ci-cd-setup.md`
3. **Committed to main branch**

## 🔧 What You Need to Do (5 minutes)

### Step 1: Create Azure Service Principal

```bash
az ad sp create-for-rbac \
  --name "github-eu-regulations-deployer" \
  --role contributor \
  --scopes /subscriptions/96081c7f-5183-41a0-8cf9-0500505b6c69/resourceGroups/rg-ansvar-dev \
  --sdk-auth
```

**⚠️ SAVE THE JSON OUTPUT** - you can't retrieve it again!

### Step 2: Add GitHub Secret

1. Go to https://github.com/Ansvar-Systems/EU_compliance_MCP/settings/secrets/actions
2. Click **New repository secret**
3. Name: `AZURE_CREDENTIALS`
4. Value: Paste the entire JSON from Step 1
5. Click **Add secret**

### Step 3: Grant Key Vault Access

```bash
# Get service principal ID
SP_OBJECT_ID=$(az ad sp list --display-name "github-eu-regulations-deployer" --query [0].id -o tsv)

# Grant read access to Key Vault
az keyvault set-policy \
  --name kv-ansvar-dev \
  --object-id $SP_OBJECT_ID \
  --secret-permissions get list
```

## ✨ You're Done!

Now every time you push a version tag, GitHub Actions automatically deploys to Azure:

```bash
# Make changes
git add .
git commit -m "feat: updated regulations"

# Deploy to Azure (automated!)
git tag v0.4.2
git push origin v0.4.2

# Watch it deploy
# → https://github.com/Ansvar-Systems/EU_compliance_MCP/actions
```

## 📊 Deployment Summary

| What | Where | Status |
|------|-------|--------|
| **MCP Server** | https://eu-regulations-mcp.jollysea-916ea475.westeurope.azurecontainerapps.io | ✅ Deployed |
| **REST API** | https://eu-regulations-api.jollysea-916ea475.westeurope.azurecontainerapps.io | ✅ Deployed |
| **Database** | psql-ansvar-dev.postgres.database.azure.com | ✅ Migrated (7,935 records) |
| **Docker Image** | ansvardev.azurecr.io/eu-regulations:latest | ✅ Pushed |
| **CI/CD Workflow** | `.github/workflows/deploy-azure.yml` | ✅ Committed |

## 🧪 Test It

```bash
# Test MCP Server
curl https://eu-regulations-mcp.jollysea-916ea475.westeurope.azurecontainerapps.io/health

# Test REST API search
curl -X POST https://eu-regulations-api.jollysea-916ea475.westeurope.azurecontainerapps.io/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"DORA","limit":3}'
```

**Note:** First request may take 2-3 seconds (cold start with scale-to-zero).

## 💰 Cost

- **Infrastructure:** €5-15/month (scale-to-zero)
- **CI/CD:** €0 (GitHub Actions free tier)
- **Total NEW cost:** €5-15/month

## 📚 Full Documentation

See `docs/ci-cd-setup.md` for:
- Detailed setup instructions
- Troubleshooting guide
- Rollback procedures
- Monitoring commands

## 🎯 Next Steps

1. ✅ Complete CI/CD setup (Steps 1-3 above)
2. 📝 Point M365 Agents Toolkit to MCP URL
3. 🌐 List on PulseMCP: https://pulsemcp.com
4. 📢 LinkedIn post about DORA compliance solution
