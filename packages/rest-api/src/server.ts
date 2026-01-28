#!/usr/bin/env node

/**
 * REST API Server for EU Regulations (Teams/Copilot integration)
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npm start
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *   AZURE_CLIENT_ID - Entra ID app client ID (required for auth)
 *   AZURE_TENANT_ID - Entra ID tenant ID (default: common)
 *   ALLOWED_TENANTS - Comma-separated list of allowed tenant IDs (optional)
 *   PORT - Server port (default: 3000)
 *   NODE_ENV - Environment (development/production)
 *   SKIP_AUTH - Skip authentication in development (default: false)
 *   SKIP_RATE_LIMIT - Skip rate limiting in development (default: false)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createConnection, DatabaseQueries } from '@ansvar/eu-regulations-core';

import {
  validateEntraIdToken,
  checkTenantAccess,
  tenantRateLimiter,
  requestLogger,
  errorLogger
} from './middleware/index.js';

import { createHealthRouter } from './routes/health.js';
import { createSearchRouter } from './routes/search.js';
import { createArticlesRouter } from './routes/articles.js';

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function startServer() {
  console.log('🚀 Starting EU Regulations API Server\n');

  // Initialize database connection
  console.log('📊 Connecting to database...');
  const db = createConnection();
  const dbHealthy = await db.testConnection();

  if (!dbHealthy) {
    console.error('❌ Database connection failed. Check DATABASE_URL environment variable.');
    process.exit(1);
  }
  console.log('✅ Database connected\n');

  const queries = new DatabaseQueries(db);

  // Initialize Express app
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  }));

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use(requestLogger);

  // Health check (no auth required)
  app.use('/health', createHealthRouter(db));

  // API routes (with authentication and rate limiting)
  app.use('/api', tenantRateLimiter);
  app.use('/api', validateEntraIdToken);
  app.use('/api', checkTenantAccess);

  app.use('/api/search', createSearchRouter(queries));
  app.use('/api/articles', createArticlesRouter(queries));

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      service: 'eu-regulations-api',
      version: '0.4.1',
      environment: NODE_ENV,
      endpoints: {
        health: '/health',
        search: 'POST /api/search',
        article: 'GET /api/articles/:regulation/:number',
        listArticles: 'GET /api/articles/:regulation'
      },
      documentation: 'https://github.com/Ansvar-Systems/EU_compliance_MCP',
      contact: 'hello@ansvar.eu'
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      availableEndpoints: ['/health', '/api/search', '/api/articles/:regulation/:number']
    });
  });

  // Error handler
  app.use(errorLogger);

  // Start server
  const server = app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`✅ EU Regulations API Server running`);
    console.log('='.repeat(60));
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Port: ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`API: http://localhost:${PORT}/api`);
    console.log('='.repeat(60));

    if (NODE_ENV === 'development') {
      console.log('\n💡 Development mode active:');
      if (process.env.SKIP_AUTH === 'true') {
        console.log('   ⚠️  Authentication is DISABLED');
      }
      if (process.env.SKIP_RATE_LIMIT === 'true') {
        console.log('   ⚠️  Rate limiting is DISABLED');
      }
      console.log('\n📝 Example request:');
      console.log(`   curl -X POST http://localhost:${PORT}/api/search \\`);
      console.log(`     -H "Content-Type: application/json" \\`);
      console.log(`     -H "Authorization: Bearer dev-token" \\`);
      console.log(`     -d '{"query": "incident reporting", "limit": 5}'`);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('\n📴 SIGTERM received, shutting down gracefully...');
    server.close(async () => {
      await db.close();
      console.log('✅ Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    console.log('\n📴 SIGINT received, shutting down gracefully...');
    server.close(async () => {
      await db.close();
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
}

// Start server
startServer().catch((error) => {
  console.error('❌ Fatal error starting server:', error);
  process.exit(1);
});
