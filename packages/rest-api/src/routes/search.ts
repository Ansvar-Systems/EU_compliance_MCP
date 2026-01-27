/**
 * Search routes
 */

import { Router } from 'express';
import type { Response } from 'express';
import { DatabaseQueries } from '@ansvar/eu-regulations-core';
import { AuthenticatedRequest } from '../middleware/index.js';
import { searchRateLimiter } from '../middleware/index.js';

export function createSearchRouter(queries: DatabaseQueries): Router {
  const router = Router();

  /**
   * POST /api/search
   *
   * Full-text search across all regulations
   *
   * Body:
   * {
   *   "query": "incident reporting",
   *   "regulations": ["DORA", "NIS2"],  // optional
   *   "limit": 10                        // optional, default 10
   * }
   */
  router.post('/', searchRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { query, regulations, limit = 10 } = req.body;

      // Validation
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Query parameter is required and must be a non-empty string'
        });
      }

      if (limit < 1 || limit > 50) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Limit must be between 1 and 50'
        });
      }

      // Search
      const results = await queries.searchArticles(query, regulations, limit);

      res.json({
        query,
        regulations: regulations || 'all',
        count: results.length,
        results: results.map(r => ({
          regulation: r.item.regulation,
          article: r.item.article_number,
          title: r.item.title,
          text: r.item.text.substring(0, 500) + (r.item.text.length > 500 ? '...' : ''),
          chapter: r.item.chapter,
          relevance: r.rank
        }))
      });
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to execute search'
      });
    }
  });

  return router;
}
