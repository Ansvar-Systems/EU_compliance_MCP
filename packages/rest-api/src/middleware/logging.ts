/**
 * Request logging middleware
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';

/**
 * Log API requests with timing and user info
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const authReq = req as AuthenticatedRequest;

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      tenant: authReq.user?.tid || 'anonymous',
      user: authReq.user?.oid || 'anonymous',
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };

    // Use different log levels based on status code
    if (res.statusCode >= 500) {
      console.error('API Error:', logEntry);
    } else if (res.statusCode >= 400) {
      console.warn('API Warning:', logEntry);
    } else {
      console.log('API Request:', logEntry);
    }
  });

  next();
}

/**
 * Error logging middleware
 */
export function errorLogger(err: Error, req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthenticatedRequest;

  console.error('Unhandled Error:', {
    timestamp: new Date().toISOString(),
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    tenant: authReq.user?.tid,
    user: authReq.user?.oid
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message
  });
}
