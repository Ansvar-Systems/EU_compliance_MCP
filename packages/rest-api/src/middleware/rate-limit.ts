/**
 * Rate limiting middleware
 *
 * Limits requests per tenant (organization) to prevent abuse
 */

import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from './auth.js';

/**
 * Rate limiter per tenant (organization)
 *
 * Free tier: 100 requests/minute per organization
 * This allows 10 users making 10 requests/min each, or 100 users making 1 request/min
 */
export const tenantRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,

  // Key by tenant ID (organization), not user
  keyGenerator: (req: Request) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.user?.tid || req.ip || 'anonymous';
  },

  // Custom response when rate limit exceeded
  handler: (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Your organization has exceeded the rate limit. Please try again in 1 minute.',
      tenant: authReq.user?.tid,
      limit: 100,
      windowMs: 60000
    });
  },

  // Skip rate limiting in development if explicitly disabled
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
  }
});

/**
 * Stricter rate limiter for expensive operations (search with large limits)
 */
export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 searches per minute per tenant
  keyGenerator: (req: Request) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.user?.tid || req.ip || 'anonymous';
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Search rate limit exceeded. Please try again in 1 minute.',
      limit: 30,
      windowMs: 60000
    });
  },
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
  }
});
