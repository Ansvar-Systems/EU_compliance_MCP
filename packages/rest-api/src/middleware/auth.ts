/**
 * Microsoft Entra ID (Azure AD) authentication middleware
 *
 * Validates JWT tokens from Microsoft Teams/Copilot requests
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Microsoft Entra ID JWKS endpoint
const JWKS_URI = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';

// Your Azure AD app configuration (from environment)
const TENANT_ID = process.env.AZURE_TENANT_ID || 'common';
const CLIENT_ID = process.env.AZURE_CLIENT_ID;

if (!CLIENT_ID) {
  console.warn('⚠️  AZURE_CLIENT_ID not set - authentication will fail in production');
}

// JWKS client for fetching Microsoft's public keys
const jwksClientInstance = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

// Get signing key from JWKS
function getKey(header: any, callback: any) {
  jwksClientInstance.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

// Extended Request with user info
export interface AuthenticatedRequest extends Request {
  user?: {
    oid: string;           // Object ID (unique user identifier)
    tid: string;           // Tenant ID (organization)
    name?: string;         // User display name
    email?: string;        // User email
    appId?: string;        // Application ID
  };
}

/**
 * Middleware to validate Microsoft Entra ID JWT tokens
 */
export function validateEntraIdToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Skip auth in development mode if explicitly disabled
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    console.warn('⚠️  Authentication skipped (development mode)');
    req.user = {
      oid: 'dev-user',
      tid: 'dev-tenant',
      name: 'Development User',
      email: 'dev@example.com'
    };
    return next();
  }

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header'
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Verify and decode JWT token
  jwt.verify(
    token,
    getKey,
    {
      audience: CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      algorithms: ['RS256']
    },
    (err, decoded) => {
      if (err) {
        console.error('JWT verification failed:', err.message);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }

      // Extract user info from token
      const payload = decoded as any;
      req.user = {
        oid: payload.oid,
        tid: payload.tid,
        name: payload.name,
        email: payload.preferred_username || payload.email,
        appId: payload.appid
      };

      next();
    }
  );
}

/**
 * Optional: Check if user's tenant is allowed (domain allowlist)
 */
export function checkTenantAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // In enterprise-only mode, check against approved tenant list
  const allowedTenants = process.env.ALLOWED_TENANTS?.split(',') || [];

  if (allowedTenants.length > 0 && req.user) {
    if (!allowedTenants.includes(req.user.tid)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Your organization is not authorized to use this service. Contact hello@ansvar.ai for access.'
      });
    }
  }

  next();
}
