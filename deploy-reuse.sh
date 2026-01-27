#!/bin/bash

# EU Regulations MCP Server - Azure Deployment (Reuse Existing Infrastructure)
# Cost: €40/month (vs €105/month with new resources)
#
# Reuses:
# - ansvardev.azurecr.io (Container Registry)
# - psql-ansvar-dev (PostgreSQL Database)
# - cae-ansvar-dev (Container Apps Environment)
# - rg-ansvar-dev (Resource Group)
#
# Usage: ./deploy-reuse.sh

set -e  # Exit on error

# Configuration - REUSING EXISTING RESOURCES
RESOURCE_GROUP="rg-ansvar-dev"
REGISTRY_NAME="ansvardev"
DB_NAME="psql-ansvar-dev"
DB_ADMIN="ansvaradmin"
DB_DATABASE="eu_regulations"
CONTAINER_ENV="cae-ansvar-dev"
MCP_APP="eu-regulations-mcp"
API_APP="eu-regulations-api"
IMAGE_TAG="$(date +%Y%m%d-%H%M%S)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo " EU Regulations - Optimized Deployment"
echo " Reusing Existing Infrastructure"
echo " Cost: €5-15/month (scale-to-zero)"
echo "=========================================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v az &> /dev/null; then
    echo -e "${RED}❌ Azure CLI not found${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found${NC}"
    exit 1
fi

if ! az account show &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in. Running 'az login'...${NC}"
    az login
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"
echo ""

# Get database password
echo "🔐 Database credentials needed:"
echo "   Server:   $DB_NAME.postgres.database.azure.com"
echo "   User:     $DB_ADMIN"
echo ""
echo -n "Enter database password: "
read -s DB_PASSWORD
echo ""
echo ""

if [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}❌ Password required${NC}"
    exit 1
fi

DB_HOST="$DB_NAME.postgres.database.azure.com"
DB_CONNECTION_STRING="postgresql://$DB_ADMIN:$DB_PASSWORD@$DB_HOST:5432/$DB_DATABASE?sslmode=require"

# Step 1: Create database (if not exists)
echo "🗄️  Step 1/7: Creating database '$DB_DATABASE'..."
if az postgres flexible-server db show --server-name $DB_NAME --resource-group $RESOURCE_GROUP --database-name $DB_DATABASE &> /dev/null; then
    echo -e "${YELLOW}   Database already exists${NC}"
else
    az postgres flexible-server db create \
        --server-name $DB_NAME \
        --resource-group $RESOURCE_GROUP \
        --database-name $DB_DATABASE \
        --output none
    echo -e "${GREEN}   ✅ Created database${NC}"
fi
echo ""

# Step 2: Run migration
echo "📊 Step 2/7: Migrating data (7,972 records)..."
export DATABASE_URL="$DB_CONNECTION_STRING"

if npx tsx scripts/migrate-postgres.ts; then
    echo -e "${GREEN}   ✅ Migration complete${NC}"
else
    echo -e "${RED}   ❌ Migration failed${NC}"
    exit 1
fi
echo ""

# Step 3: Get registry credentials
echo "🔑 Step 3/7: Getting registry credentials..."
REGISTRY_SERVER=$(az acr show --name $REGISTRY_NAME --query loginServer -o tsv)
echo -e "${GREEN}   ✅ Registry: $REGISTRY_SERVER${NC}"
echo ""

# Step 4: Build Docker image
echo "🔨 Step 4/7: Building Docker image..."
docker build -t $REGISTRY_SERVER/eu-regulations:$IMAGE_TAG .
docker tag $REGISTRY_SERVER/eu-regulations:$IMAGE_TAG $REGISTRY_SERVER/eu-regulations:latest
echo -e "${GREEN}   ✅ Built image${NC}"
echo ""

# Step 5: Push to registry
echo "📤 Step 5/7: Pushing to registry..."
az acr login --name $REGISTRY_NAME
docker push $REGISTRY_SERVER/eu-regulations:$IMAGE_TAG
docker push $REGISTRY_SERVER/eu-regulations:latest
echo -e "${GREEN}   ✅ Pushed to registry${NC}"
echo ""

# Step 6: Deploy MCP Server
echo "🚀 Step 6/7: Deploying MCP Server..."
az containerapp create \
    --name $MCP_APP \
    --resource-group $RESOURCE_GROUP \
    --environment $CONTAINER_ENV \
    --image $REGISTRY_SERVER/eu-regulations:latest \
    --registry-server $REGISTRY_SERVER \
    --registry-identity system \
    --target-port 3000 \
    --ingress external \
    --min-replicas 0 \
    --max-replicas 3 \
    --cpu 0.5 \
    --memory 1Gi \
    --secrets \
        database-url="$DB_CONNECTION_STRING" \
    --env-vars \
        NODE_ENV=production \
        MCP_HTTP_PORT=3000 \
        PORT=3000 \
        DATABASE_URL=secretref:database-url \
    --output none 2>/dev/null || az containerapp update \
        --name $MCP_APP \
        --resource-group $RESOURCE_GROUP \
        --image $REGISTRY_SERVER/eu-regulations:latest \
        --set-env-vars DATABASE_URL=secretref:database-url \
        --output none

MCP_URL=$(az containerapp show --name $MCP_APP --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv)
echo -e "${GREEN}   ✅ MCP Server: https://$MCP_URL${NC}"
echo ""

# Step 7: Deploy REST API
echo "🌐 Step 7/7: Deploying REST API..."
az containerapp create \
    --name $API_APP \
    --resource-group $RESOURCE_GROUP \
    --environment $CONTAINER_ENV \
    --image $REGISTRY_SERVER/eu-regulations:latest \
    --registry-server $REGISTRY_SERVER \
    --registry-identity system \
    --target-port 3001 \
    --ingress external \
    --min-replicas 0 \
    --max-replicas 5 \
    --cpu 0.5 \
    --memory 1Gi \
    --secrets \
        database-url="$DB_CONNECTION_STRING" \
    --env-vars \
        NODE_ENV=production \
        SERVICE_TYPE=api \
        PORT=3001 \
        DATABASE_URL=secretref:database-url \
        SKIP_AUTH=true \
        SKIP_RATE_LIMIT=true \
    --output none 2>/dev/null || az containerapp update \
        --name $API_APP \
        --resource-group $RESOURCE_GROUP \
        --image $REGISTRY_SERVER/eu-regulations:latest \
        --set-env-vars DATABASE_URL=secretref:database-url SERVICE_TYPE=api \
        --output none

API_URL=$(az containerapp show --name $API_APP --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv)
echo -e "${GREEN}   ✅ REST API: https://$API_URL${NC}"
echo ""

# Summary
echo "=========================================="
echo " 🎉 Deployment Complete!"
echo "=========================================="
echo ""
echo "📍 Resources Used:"
echo "   Resource Group:  $RESOURCE_GROUP (existing)"
echo "   Registry:        $REGISTRY_SERVER (existing)"
echo "   Database:        $DB_HOST (existing)"
echo "   Environment:     $CONTAINER_ENV (existing)"
echo ""
echo "🌐 Service URLs:"
echo "   MCP Server:      https://$MCP_URL"
echo "   REST API:        https://$API_URL"
echo ""
echo "🔍 Test your deployment:"
echo "   MCP Health:      curl https://$MCP_URL/health"
echo "   API Health:      curl https://$API_URL/health"
echo "   API Search:      curl -X POST https://$API_URL/api/search \\"
echo "                      -H 'Content-Type: application/json' \\"
echo "                      -d '{\"query\":\"DORA\",\"limit\":3}'"
echo ""
echo "💰 Monthly Cost: €5-15 (with scale-to-zero)"
echo "   Containers scale to 0 when idle"
echo "   Only pay for actual compute time used"
echo "   Database, Registry, Environment: Already paid for!"
echo ""
echo "💵 Estimated savings:"
echo "   vs New infrastructure: €90-100/month (86-95% savings)"
echo "   vs Always-on (min=1): €25-35/month (62-87% savings)"
echo ""
echo "📚 Next steps:"
echo "   1. Test endpoints above"
echo "   2. Point M365 Agents Toolkit to: https://$MCP_URL"
echo "   3. List on PulseMCP: https://pulsemcp.com"
echo "   4. Post on LinkedIn about DORA compliance"
echo ""
echo "=========================================="
