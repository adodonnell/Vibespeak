// Simple in-memory rate limiter
// For production, use Redis or similar

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private windowMs: number = 60000, // 1 minute
    private maxRequests: number = 100 // per window
  ) {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // Check if request is allowed
  check(key: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || entry.resetTime < now) {
      // New window
      const resetTime = now + this.windowMs;
      this.limits.set(key, { count: 1, resetTime });
      return { allowed: true, remaining: this.maxRequests - 1, resetTime };
    }

    if (entry.count >= this.maxRequests) {
      // Rate limited
      return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    // Increment count
    entry.count++;
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetTime: entry.resetTime
    };
  }

  // Reset rate limit for a key
  reset(key: string): void {
    this.limits.delete(key);
  }

  // Clean up expired entries
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetTime < now) {
        this.limits.delete(key);
      }
    }
  }

  // Stop cleanup interval
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Pre-configured limiters
export const authLimiter = new RateLimiter(60 * 1000, 10); // 10 requests per minute for auth
export const apiLimiter = new RateLimiter(60 * 1000, 100); // 100 requests per minute for API
export const messageLimiter = new RateLimiter(60 * 1000, 20); // 20 messages per minute

// HTTP middleware helper
export function getRateLimitHeaders(
  limiter: RateLimiter,
  key: string
): Record<string, string> {
  const result = limiter.check(key);
  
  return {
    'X-RateLimit-Limit': String(limiter['maxRequests']),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000)),
    'Retry-After': result.allowed ? '0' : String(Math.ceil((result.resetTime - Date.now()) / 1000))
  };
}
