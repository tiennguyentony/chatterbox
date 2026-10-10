import type { Clock } from '../lib/clock';

interface Window {
  startedAt: number;
  count: number;
}

// Fixed-window counter per key, kept in memory.
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: { max: number; windowMs: number },
    private readonly clock: Clock,
  ) {}

  allow(key: string): boolean {
    const now = this.clock.now().getTime();
    let window = this.windows.get(key);
    if (!window || now - window.startedAt >= this.limit.windowMs) {
      window = { startedAt: now, count: 0 };
      this.windows.set(key, window);
    }
    if (window.count >= this.limit.max) return false;
    window.count++;
    this.prune(now);
    return true;
  }

  private prune(now: number): void {
    if (this.windows.size < 1000) return;
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.limit.windowMs) this.windows.delete(key);
    }
  }
}
