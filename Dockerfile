# EU Regulations MCP Server
# Multi-stage build for minimal production image

# Build stage
FROM node:20-alpine AS builder

# Install build tools for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files and config first
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (ignore prepare script - we'll build manually)
RUN npm ci --ignore-scripts

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only, skip lifecycle scripts
RUN npm ci --omit=dev --ignore-scripts

# Rebuild better-sqlite3 native module for this platform
RUN npm rebuild better-sqlite3

# Clean up build tools to reduce image size
RUN apk del python3 make g++ && \
    npm cache clean --force

# Security: create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy pre-built database
COPY data/regulations.db ./data/regulations.db

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

ENV NODE_ENV=production

# Start the MCP server
CMD ["node", "dist/index.js"]
