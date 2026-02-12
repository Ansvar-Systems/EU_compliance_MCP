import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../../src/middleware/rate-limit.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(5, 60000); // 5 requests per minute for testing
  });

  it('allows requests under limit', () => {
    const ip = '203.0.113.1';

    // First 5 requests should be allowed
    for (let i = 0; i < 5; i++) {
      expect(limiter.checkLimit(ip)).toBe(true);
    }

    // Different IP should have independent limit
    expect(limiter.checkLimit('203.0.113.2')).toBe(true);
  });

  it('blocks requests over limit', () => {
    const ip = '203.0.113.3';

    // Use up the limit
    for (let i = 0; i < 5; i++) {
      expect(limiter.checkLimit(ip)).toBe(true);
    }

    // Next request should be blocked
    expect(limiter.checkLimit(ip)).toBe(false);

    // Rate limit info should reflect blocked state
    const info = limiter.getRateLimitInfo(ip);
    expect(info.allowed).toBe(false);
    expect(info.remaining).toBe(0);
    expect(info.resetAt).toBeGreaterThan(Date.now());
  });
});
