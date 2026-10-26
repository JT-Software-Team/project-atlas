/**
 * Small fixed-window, in-memory rate limiter. Adequate for a single server
 * process; swap for a shared store (e.g. Redis) when running several instances.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  /** Returns seconds to wait if the key is over the limit, otherwise 0. */
  hit(key: string): number {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.sweep(now);
      return 0;
    }
    entry.count++;
    return entry.count > this.limit ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
