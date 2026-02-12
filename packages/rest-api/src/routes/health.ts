/**
 * Health check routes
 */

import { Router } from 'express';
import type { Response } from 'express';
import type { DatabaseAdapter } from '@ansvar/eu-regulations-core';
import { AuthenticatedRequest } from '../middleware/index.js';

export function createHealthRouter(db: DatabaseAdapter): Router {
  const router = Router();

  /**
   * GET /health
   *
   * Health check endpoint (no auth required)
   */
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const dbHealthy = await db.testConnection();

      const health = {
        status: dbHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        database: {
          connected: dbHealthy,
          type: process.env.DATABASE_URL ? 'postgresql' : 'sqlite'
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
