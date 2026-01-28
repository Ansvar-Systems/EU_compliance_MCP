# Deployment Guide - REST API for Teams/Copilot

This guide covers deploying the REST API to production for Microsoft Teams integration.

## Prerequisites

1. **PostgreSQL database** - Follow `docs/postgres-setup.md`
2. **Azure AD app** - Follow `packages/teams-extension/README.md` steps 1-3
3. **Domain name** - For API endpoint (e.g., `api.ansvar.eu`)
4. **SSL certificate** - Most platforms provide this automatically

## Quick Start (Docker)

```bash
# Build image
docker build -f Dockerfile.api -t eu-regs-api .

# Run locally
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e AZURE_CLIENT_ID="..." \
  -e NODE_ENV="production" \
  eu-regs-api

# Test
curl http://localhost:3000/health
```

## Option 1: Azure Container Apps

### Deploy

```bash
# Install Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Login
az login

# Create resource group
az group create --name eu-regs-rg --location westeurope

# Create container registry
az acr create --name euregsacr --resource-group eu-regs-rg --sku Basic

# Build and push image
az acr build --registry euregsacr --image eu-regs-api:latest -f Dockerfile.api .

# Create container app environment
az containerapp env create \
  --name eu-regs-env \
  --resource-group eu-regs-rg \
  --location westeurope

# Deploy container app
az containerapp create \
  --name eu-regs-api \
  --resource-group eu-regs-rg \
  --environment eu-regs-env \
  --image euregsacr.azurecr.io/eu-regs-api:latest \
  --target-port 3000 \
  --ingress external \
  --registry-server euregsacr.azurecr.io \
  --env-vars \
    DATABASE_URL="secretref:database-url" \
    AZURE_CLIENT_ID="secretref:azure-client-id" \
    NODE_ENV="production" \
  --cpu 1 --memory 2Gi \
  --min-replicas 1 --max-replicas 10

# Add secrets
az containerapp secret set \
  --name eu-regs-api \
  --resource-group eu-regs-rg \
  --secrets \
    database-url="postgresql://..." \
    azure-client-id="..."

# Get URL
az containerapp show \
  --name eu-regs-api \
  --resource-group eu-regs-rg \
  --query properties.configuration.ingress.fqdn
```

**Cost:** ~$30-50/month for production workload

## Option 2: AWS ECS Fargate

### Deploy

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure
aws configure

# Create ECR repository
aws ecr create-repository --repository-name eu-regs-api

# Build and push
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
docker build -f Dockerfile.api -t eu-regs-api .
docker tag eu-regs-api:latest ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/eu-regs-api:latest
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/eu-regs-api:latest

# Create ECS cluster (via AWS Console or CloudFormation)
# - Fargate launch type
# - ALB with HTTPS
# - Task definition: 1 vCPU, 2GB RAM
# - Environment variables from Secrets Manager
# - Auto-scaling: 1-10 tasks based on CPU
```

**Cost:** ~$40-60/month for production workload

## Option 3: Google Cloud Run

### Deploy

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Configure
gcloud init

# Build and deploy in one command
gcloud run deploy eu-regs-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="postgresql://..." \
  --set-env-vars AZURE_CLIENT_ID="..." \
  --set-env-vars NODE_ENV="production" \
  --cpu 1 \
  --memory 2Gi \
  --min-instances 1 \
  --max-instances 10

# Get URL
gcloud run services describe eu-regs-api --region us-central1 --format 'value(status.url)'
```

**Cost:** ~$25-40/month for production workload

## Option 4: DigitalOcean App Platform

### Deploy

```bash
# Install doctl
snap install doctl
doctl auth init

# Create app
doctl apps create --spec app-spec.yaml

# app-spec.yaml:
name: eu-regs-api
services:
  - name: api
    dockerfile_path: Dockerfile.api
    github:
      repo: Ansvar-Systems/EU_compliance_MCP
      branch: main
    envs:
      - key: DATABASE_URL
        value: ${DATABASE_URL}
      - key: AZURE_CLIENT_ID
        value: ${AZURE_CLIENT_ID}
      - key: NODE_ENV
        value: production
    http_port: 3000
    instance_count: 1
    instance_size_slug: basic-xxs
```

**Cost:** ~$12/month for basic tier

## Option 5: Render

### Deploy via Web UI

1. Go to [render.com](https://render.com)
2. Create new Web Service
3. Connect GitHub repo
4. Configure:
   - Docker: `Dockerfile.api`
   - Region: Choose closest to users
   - Environment variables:
     - `DATABASE_URL`
     - `AZURE_CLIENT_ID`
     - `NODE_ENV=production`
5. Deploy

**Cost:** $7/month for starter tier

## Environment Variables

All deployments need these environment variables:

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db
AZURE_CLIENT_ID=your-app-id-here
NODE_ENV=production

# Optional
AZURE_TENANT_ID=common  # Or specific tenant ID
ALLOWED_TENANTS=tenant-id-1,tenant-id-2
PORT=3000
CORS_ORIGIN=*
```

## Custom Domain & SSL

### Azure Container Apps
```bash
az containerapp hostname add \
  --name eu-regs-api \
  --resource-group eu-regs-rg \
  --hostname api.ansvar.eu

# SSL certificate auto-provisioned
```

### AWS ECS
- Use Route 53 for DNS
- ALB handles SSL termination
- Request certificate from ACM (free)

### Cloud Run / Render / DigitalOcean
- All provide automatic HTTPS
- Just add custom domain in dashboard

## Monitoring

### Application Insights (Azure)

```bash
# Add to package.json
npm install @azure/monitor-opentelemetry

# In server.ts
import { useAzureMonitor } from "@azure/monitor-opentelemetry";
useAzureMonitor({
  connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
});
```

### CloudWatch (AWS)

Built-in with ECS Fargate - logs automatically sent to CloudWatch Logs.

### Google Cloud Monitoring

Built-in with Cloud Run - view logs and metrics in Cloud Console.

## Scaling Configuration

### Autoscaling Rules

**Metric:** CPU utilization
**Target:** 70%
**Min instances:** 1
**Max instances:** 10

**Expected performance:**
- Single instance: ~100 requests/sec
- 10 instances: ~1000 requests/sec
- Sufficient for 10,000+ active Teams users

### Database Scaling

**Read replicas:** Add if read queries > 1000/sec
**Connection pooling:** Use PgBouncer if connections > 100
**Caching:** Add Redis for frequently accessed articles

## Cost Optimization

### Development/Staging
- Use smallest instance size
- Scale to zero when idle (Cloud Run, Azure Container Apps)
- Share database with production (separate schema)

### Production
- Right-size instances based on actual usage
- Use reserved instances for predictable workloads
- Enable autoscaling to handle bursts
- Monitor costs weekly

### Expected Costs

| Users | Requests/day | Compute | Database | Total |
|-------|--------------|---------|----------|-------|
| 100 | 1,000 | $12 | $15 | ~$30/mo |
| 1,000 | 10,000 | $40 | $25 | ~$70/mo |
| 10,000 | 100,000 | $150 | $100 | ~$250/mo |

## Security Checklist

- [ ] SSL/HTTPS enabled
- [ ] Environment variables in secrets manager (not hardcoded)
- [ ] Database has firewall rules (only API can connect)
- [ ] API has rate limiting enabled
- [ ] Health check endpoint responds
- [ ] Logs don't contain sensitive data
- [ ] CORS configured properly
- [ ] Helmet.js security headers enabled

## Troubleshooting

### Container won't start
```bash
# Check logs
docker logs eu-regs-api

# Common issues:
# - DATABASE_URL not set
# - PostgreSQL not reachable
# - Port already in use
```

### High memory usage
```bash
# Check connection pool settings
# Default: 20 max connections
# Reduce if memory limited:
# In connection.ts: max: 10
```

### Slow queries
```bash
# Check PostgreSQL indexes
psql $DATABASE_URL -c "\d articles"

# Should have:
# - articles_fts_idx (GIN index)
# - articles_regulation_idx
```

## Next Steps

After deployment:
1. Test health endpoint: `curl https://api.example.com/health`
2. Test search: Use curl with Bearer token
3. Update Teams manifest with API URL
4. Submit to Microsoft commercial marketplace
5. Monitor usage and costs

## Support

- Docs: [github.com/Ansvar-Systems/EU_compliance_MCP](https://github.com/Ansvar-Systems/EU_compliance_MCP)
- Email: hello@ansvar.eu
