/**
 * Health check routes
 */

import { Router } from 'express';
import type { Response } from 'express';
import { DatabaseConnection } from '@ansvar/eu-regulations-core';
import { AuthenticatedRequest } from '../middleware/index.js';

export function createHealthRouter(db: DatabaseConnection): Router {
  const router = Router();

  /**
   * GET /health
   *
   * Health check endpoint (no auth required)
   */
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const dbHealthy = await db.testConnection();
      const poolStats = db.getPoolStats();

      const health = {
        status: dbHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        database: {
          connected: dbHealthy,
          pool: poolStats
        },
        service: 'eu-regulations-api',
        version: process.env.npm_package_version || '0.4.1'
      };

      const statusCode = dbHealthy ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      });
    }
  });

  return router;
}
