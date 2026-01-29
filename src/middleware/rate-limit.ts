interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter for IP-based request throttling.
 *
 * Uses fixed time windows that reset at specific intervals. This is simpler
 * than true sliding windows but allows burst traffic at window boundaries
 * (e.g., 100 requests at 09:59:59 + 100 at 10:00:01 = 200 in 2 seconds).
 *
 * Trade-off accepted: Simplicity and performance over burst protection.
 * Suitable for basic rate limiting where occasional bursts are acceptable.
 *
 * @example
 * const limiter = new RateLimiter(100, 3600000); // 100 requests per hour
 * if (limiter.checkLimit(clientIP)) {
 *   // Allow request
 * } else {
 *   // Return 429 Too Many Requests
 * }
 */
export class RateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request from the given IP should be allowed
   * @param ip Client IP address
   * @returns true if allowed, false if rate limited
   */
  checkLimit(ip: string): boolean {
    return this.getRateLimitInfo(ip).allowed;
  }

  /**
   * Get detailed rate limit information for an IP
   * @param ip Client IP address
   * @returns Rate limit status with remaining requests and reset time
   */
  getRateLimitInfo(ip: string): RateLimitInfo {
    const now = Date.now();
    let record = this.records.get(ip);

    // Clean up if window expired
    if (record && now > record.resetAt) {
      this.records.delete(ip);
      record = undefined;
    }

    // Initialize new record if needed
    if (!record) {
      record = {
        count: 0,
        resetAt: now + this.windowMs,
      };
      this.records.set(ip, record);
    }

    // Check if over limit
    if (record.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
      };
    }

    // Increment and allow
    record.count++;

    return {
      allowed: true,
      remaining: this.maxRequests - record.count,
      resetAt: record.resetAt,
    };
  }

  /**
   * Clean up old records to prevent memory leak
   * Should be called periodically (e.g., every hour)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [ip, record] of this.records.entries()) {
      if (now > record.resetAt) {
        this.records.delete(ip);
      }
    }
  }
}
