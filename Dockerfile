# EU Regulations MCP Server + REST API
# Multi-stage build for Azure Container Apps
# Serves both MCP-over-HTTP and REST API
#
# IMPORTANT: Always build for AMD64 (Azure platform requirement)
# Build command: docker buildx build --platform linux/amd64 -t <image> .

# Build stage
FROM --platform=linux/amd64 node:24-alpine AS builder

# Install build tools for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/rest-api/package.json ./packages/rest-api/

# Install dependencies (skip prepare script - we'll build explicitly later)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Rebuild better-sqlite3 for build tools to work
RUN cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run install

# Copy source code
COPY packages/ ./packages/
COPY src/ ./src/
COPY tsconfig.json ./

# Build packages
RUN pnpm -r build

# Build MCP server
RUN npm run build

# Production stage
FROM --platform=linux/amd64 node:24-alpine AS production

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/rest-api/package.json ./packages/rest-api/

# Copy built artifacts BEFORE install to satisfy prepare script
COPY --from=builder /app/dist ./dist

# Install production dependencies only (ignore prepare script - we already have dist/)
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Rebuild better-sqlite3 for this platform (Node v24 + Linux)
RUN cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run install

# Clean up build tools
RUN apk del python3 make g++ && \
    pnpm store prune && \
    npm cache clean --force

# Security: create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built package artifacts from builder (root dist/ already copied earlier)
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/rest-api/dist ./packages/rest-api/dist

# Copy pre-built database
COPY data/regulations.db ./data/regulations.db

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

ENV NODE_ENV=production
ENV PORT=3000

# Expose both ports
# 3000 = MCP-over-HTTP
# 3001 = REST API
EXPOSE 3000 3001

# Health check (checks whichever service is running)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + process.env.PORT + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Default: Start MCP HTTP server
# Override with environment variable SERVICE_TYPE=api for REST API
CMD ["sh", "-c", "if [ \"$SERVICE_TYPE\" = \"api\" ]; then node packages/rest-api/dist/server.js; else node dist/http-server.js; fi"]
