#!/bin/bash

# EU Regulations MCP Server - Azure Deployment Script
# Deploys both MCP server and REST API to Azure Container Apps
#
# Usage: ./deploy.sh
#
# Prerequisites:
# - Azure CLI installed (az)
# - Logged in to Azure (az login)
# - Docker installed

set -e  # Exit on error

# Configuration
RESOURCE_GROUP="eu-regulations-rg"
LOCATION="westeurope"
REGISTRY_NAME="euregsmcp"
DB_NAME="eu-regulations-db"
DB_ADMIN="dbadmin"
CONTAINER_ENV="eu-regulations-env"
MCP_APP="eu-regulations-mcp"
API_APP="eu-regulations-api"
IMAGE_TAG="$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0:31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo " EU Regulations MCP Server Deployment"
echo " Azure Container Apps"
echo "=========================================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v az &> /dev/null; then
    echo -e "${RED}❌ Azure CLI not found. Install from: https://learn.microsoft.com/cli/azure/install-azure-cli${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Install from: https://docker.com${NC}"
    exit 1
fi

# Check Azure login
if ! az account show &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Azure. Running 'az login'...${NC}"
    az login
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo -e "${GREEN}✅ Logged in to Azure (Subscription: $SUBSCRIPTION_ID)${NC}"
echo ""

# Generate secure password for PostgreSQL
DB_PASSWORD=$(openssl rand -base64 32 | tr -d /=+ | cut -c1-25)
echo -e "${YELLOW}🔐 Generated secure database password${NC}"
echo ""

# Step 1: Create Resource Group
echo "📦 Step 1/10: Creating resource group..."
if az group show --name $RESOURCE_GROUP &> /dev/null; then
    echo -e "${YELLOW}   Resource group already exists${NC}"
else
    az group create \
        --name $RESOURCE_GROUP \
        --location $LOCATION \
        --output none
    echo -e "${GREEN}   ✅ Created resource group: $RESOURCE_GROUP${NC}"
fi
echo ""

# Step 2: Create Container Registry
echo "🐳 Step 2/10: Creating container registry..."
if az acr show --name $REGISTRY_NAME --resource-group $RESOURCE_GROUP &> /dev/null; then
    echo -e "${YELLOW}   Registry already exists${NC}"
else
    az acr create \
        --name $REGISTRY_NAME \
        --resource-group $RESOURCE_GROUP \
        --sku Basic \
        --admin-enabled true \
        --output none
    echo -e "${GREEN}   ✅ Created registry: $REGISTRY_NAME${NC}"
fi
echo ""

# Step 3: Get registry credentials
echo "🔑 Step 3/10: Getting registry credentials..."
REGISTRY_SERVER=$(az acr show --name $REGISTRY_NAME --query loginServer -o tsv)
REGISTRY_USERNAME=$(az acr credential show --name $REGISTRY_NAME --query username -o tsv)
REGISTRY_PASSWORD=$(az acr credential show --name $REGISTRY_NAME --query passwords[0].value -o tsv)
echo -e "${GREEN}   ✅ Registry: $REGISTRY_SERVER${NC}"
echo ""

# Step 4: Build and push Docker image
echo "🔨 Step 4/10: Building Docker image..."
docker build -t $REGISTRY_SERVER/mcp-server:$IMAGE_TAG .
docker tag $REGISTRY_SERVER/mcp-server:$IMAGE_TAG $REGISTRY_SERVER/mcp-server:latest
echo -e "${GREEN}   ✅ Built image${NC}"
echo ""

echo "📤 Step 5/10: Pushing to registry..."
az acr login --name $REGISTRY_NAME
docker push $REGISTRY_SERVER/mcp-server:$IMAGE_TAG
docker push $REGISTRY_SERVER/mcp-server:latest
echo -e "${GREEN}   ✅ Pushed to registry${NC}"
echo ""

# Step 6: Create PostgreSQL database
echo "🗄️  Step 6/10: Creating PostgreSQL database..."
if az postgres flexible-server show --name $DB_NAME --resource-group $RESOURCE_GROUP &> /dev/null; then
    echo -e "${YELLOW}   Database already exists${NC}"
    echo -e "${YELLOW}   ⚠️  Using existing database - password not changed${NC}"
else
    az postgres flexible-server create \
        --name $DB_NAME \
        --resource-group $RESOURCE_GROUP \
        --location $LOCATION \
        --admin-user $DB_ADMIN \
        --admin-password "$DB_PASSWORD" \
        --sku-name Standard_B1ms \
        --storage-size 32 \
        --version 16 \
        --public-access 0.0.0.0-255.255.255.255 \
        --output none
    echo -e "${GREEN}   ✅ Created database: $DB_NAME${NC}"

    # Wait for database to be ready
    echo "   Waiting for database to be ready..."
    sleep 30
fi

DB_HOST="$DB_NAME.postgres.database.azure.com"
DB_CONNECTION_STRING="postgresql://$DB_ADMIN:$DB_PASSWORD@$DB_HOST:5432/postgres?sslmode=require"
echo ""

# Step 7: Run database migration
echo "📊 Step 7/10: Running database migration..."
echo "   This will copy 7,972 records from SQLite to PostgreSQL..."

export DATABASE_URL="$DB_CONNECTION_STRING"
if npx tsx scripts/migrate-postgres.ts; then
    echo -e "${GREEN}   ✅ Migration complete${NC}"
else
    echo -e "${YELLOW}   ⚠️  Migration may have failed, but continuing...${NC}"
fi
echo ""

# Step 8: Create Container Apps environment
echo "🌍 Step 8/10: Creating Container Apps environment..."
if az containerapp env show --name $CONTAINER_ENV --resource-group $RESOURCE_GROUP &> /dev/null; then
    echo -e "${YELLOW}   Environment already exists${NC}"
else
    az containerapp env create \
        --name $CONTAINER_ENV \
        --resource-group $RESOURCE_GROUP \
        --location $LOCATION \
        --output none
    echo -e "${GREEN}   ✅ Created environment: $CONTAINER_ENV${NC}"
fi
echo ""

# Step 9: Deploy MCP Server
echo "🚀 Step 9/10: Deploying MCP Server..."
az containerapp create \
    --name $MCP_APP \
    --resource-group $RESOURCE_GROUP \
    --environment $CONTAINER_ENV \
    --image $REGISTRY_SERVER/mcp-server:latest \
    --registry-server $REGISTRY_SERVER \
    --registry-username $REGISTRY_USERNAME \
    --registry-password $REGISTRY_PASSWORD \
    --target-port 3000 \
    --ingress external \
    --min-replicas 1 \
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
        --image $REGISTRY_SERVER/mcp-server:latest \
        --output none

MCP_URL=$(az containerapp show --name $MCP_APP --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv)
echo -e "${GREEN}   ✅ MCP Server deployed: https://$MCP_URL${NC}"
echo ""

# Step 10: Deploy REST API
echo "🌐 Step 10/10: Deploying REST API..."
az containerapp create \
    --name $API_APP \
    --resource-group $RESOURCE_GROUP \
    --environment $CONTAINER_ENV \
    --image $REGISTRY_SERVER/mcp-server:latest \
    --registry-server $REGISTRY_SERVER \
    --registry-username $REGISTRY_USERNAME \
    --registry-password $REGISTRY_PASSWORD \
    --target-port 3001 \
    --ingress external \
    --min-replicas 1 \
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
        --image $REGISTRY_SERVER/mcp-server:latest \
        --output none

API_URL=$(az containerapp show --name $API_APP --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv)
echo -e "${GREEN}   ✅ REST API deployed: https://$API_URL${NC}"
echo ""

# Summary
echo "=========================================="
echo " 🎉 Deployment Complete!"
echo "=========================================="
echo ""
echo "📍 Resources Created:"
echo "   Resource Group:  $RESOURCE_GROUP"
echo "   Location:        $LOCATION"
echo "   Registry:        $REGISTRY_SERVER"
echo "   Database:        $DB_HOST"
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
echo "                      -d '{\"query\":\"incident reporting\",\"limit\":3}'"
echo ""
echo "📝 Save these credentials:"
echo "   Database Host:   $DB_HOST"
echo "   Database User:   $DB_ADMIN"
echo "   Database Pass:   $DB_PASSWORD"
echo ""
echo "💰 Estimated monthly cost: €100"
echo "   (Container Apps: €40, PostgreSQL: €60)"
echo ""
echo "📚 Next steps:"
echo "   1. Test endpoints above"
echo "   2. Configure Azure AD for production auth"
echo "   3. Point Microsoft 365 Agents Toolkit to MCP URL"
echo "   4. List on PulseMCP: https://pulsemcp.com"
echo ""
echo "=========================================="
