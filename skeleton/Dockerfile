# ═══════════════════════════════════════════════════════════════════════════
# MCP SERVER DOCKERFILE
# ═══════════════════════════════════════════════════════════════════════════
#
# Multi-stage Dockerfile for building and running the MCP server.
#
# Usage:
#   docker build -t your-mcp-server .
#   docker run -i your-mcp-server
#
# ═══════════════════════════════════════════════════════════════════════════

# ───────────────────────────────────────────────────────────────────────────
# STAGE 1: BUILD
# ───────────────────────────────────────────────────────────────────────────
# Compiles TypeScript to JavaScript
# ───────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install ALL dependencies (including dev)
# --ignore-scripts prevents postinstall from running
RUN npm ci --ignore-scripts

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript
RUN npm run build

# ───────────────────────────────────────────────────────────────────────────
# STAGE 2: PRODUCTION
# ───────────────────────────────────────────────────────────────────────────
# Minimal image with only production dependencies
# ───────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Then rebuild better-sqlite3 for Alpine Linux
RUN npm ci --omit=dev && \
    npm rebuild better-sqlite3

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Copy pre-built database
# This file should already exist from running `npm run build:db`
COPY data/database.db ./data/database.db

# ───────────────────────────────────────────────────────────────────────────
# SECURITY
# ───────────────────────────────────────────────────────────────────────────
# Create and use non-root user
# ───────────────────────────────────────────────────────────────────────────

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

# ───────────────────────────────────────────────────────────────────────────
# ENVIRONMENT
# ───────────────────────────────────────────────────────────────────────────

# Production mode
ENV NODE_ENV=production

# Database path (matches the COPY destination above)
# Customize this env var name for your server
ENV YOUR_MCP_DB_PATH=/app/data/database.db

# ───────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ───────────────────────────────────────────────────────────────────────────
# MCP servers use stdio, so we run node directly
# ───────────────────────────────────────────────────────────────────────────

CMD ["node", "dist/index.js"]
