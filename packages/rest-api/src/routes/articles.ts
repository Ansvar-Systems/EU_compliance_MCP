/**
 * Article routes
 */

import { Router } from 'express';
import type { Response } from 'express';
import { DatabaseQueries } from '@ansvar/eu-regulations-core';
import { AuthenticatedRequest } from '../middleware/index.js';

export function createArticlesRouter(queries: DatabaseQueries): Router {
  const router = Router();

  /**
   * GET /api/articles/:regulation/:number
   *
   * Get a specific article
   */
  router.get('/:regulation/:number', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { regulation, number } = req.params;

      const article = await queries.getArticle(
        String(regulation).toUpperCase(),
        String(number)
      );

      if (!article) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Article ${number} not found in ${regulation}`
        });
      }

      res.json({
        regulation: article.regulation,
        article: article.article_number,
        title: article.title,
        text: article.text,
        chapter: article.chapter,
        recitals: article.recitals ? article.recitals.split(',').map(n => parseInt(n.trim())) : [],
        cross_references: article.cross_references
      });
    } catch (error) {
      console.error('Get article error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve article'
      });
    }
  });

  /**
   * GET /api/articles/:regulation
   *
   * List all articles for a regulation
   */
  router.get('/:regulation', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { regulation } = req.params;

      const articles = await queries.getArticlesByRegulation(String(regulation).toUpperCase());

      if (articles.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Regulation ${regulation} not found or has no articles`
        });
    }

      res.json({
        regulation: String(regulation).toUpperCase(),
        count: articles.length,
        articles: articles.map(a => ({
          number: a.article_number,
          title: a.title,
          chapter: a.chapter
        }))
      });
    } catch (error) {
      console.error('List articles error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list articles'
      });
    }
  });

  return router;
}
