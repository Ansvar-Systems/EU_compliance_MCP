import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../../src/middleware/rate-limit.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(5, 60000); // 5 requests per minute for testing
  });

  it('should allow requests under limit', () => {
    const ip = '203.0.113.1';
    expect(limiter.checkLimit(ip)).toBe(true);
    expect(limiter.checkLimit(ip)).toBe(true);
    expect(limiter.checkLimit(ip)).toBe(true);
  });

  it('should block requests over limit', () => {
    const ip = '203.0.113.2';

    // Use up the limit
    for (let i = 0; i < 5; i++) {
      expect(limiter.checkLimit(ip)).toBe(true);
    }

    // Next request should be blocked
    expect(limiter.checkLimit(ip)).toBe(false);
  });

  it('should reset after window expires', () => {
    const ip = '203.0.113.3';
    const limiterShortWindow = new RateLimiter(2, 100); // 100ms window

    // Use up limit
    expect(limiterShortWindow.checkLimit(ip)).toBe(true);
    expect(limiterShortWindow.checkLimit(ip)).toBe(true);
    expect(limiterShortWindow.checkLimit(ip)).toBe(false);

    // Wait for window to expire
    return new Promise(resolve => {
      setTimeout(() => {
        expect(limiterShortWindow.checkLimit(ip)).toBe(true);
        resolve(undefined);
      }, 150);
    });
  });

  it('should handle multiple IPs independently', () => {
    const ip1 = '203.0.113.4';
    const ip2 = '203.0.113.5';

    // Use up limit for ip1
    for (let i = 0; i < 5; i++) {
      expect(limiter.checkLimit(ip1)).toBe(true);
    }
    expect(limiter.checkLimit(ip1)).toBe(false);

    // ip2 should still be allowed
    expect(limiter.checkLimit(ip2)).toBe(true);
  });

  it('should return remaining time when limited', () => {
    const ip = '203.0.113.6';

    // Use up limit
    for (let i = 0; i < 5; i++) {
      limiter.checkLimit(ip);
    }

    const result = limiter.getRateLimitInfo(ip);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});
