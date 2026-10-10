import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/lib/clock';
import { RateLimiter } from '../../src/ws/rateLimit';

describe('RateLimiter', () => {
  it('allows up to max per window, per key', () => {
    const clock = new FakeClock('2027-03-01T09:00:00Z');
    const limiter = new RateLimiter({ max: 2, windowMs: 1000 }, clock);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    expect(limiter.allow('b')).toBe(true);
  });

  it('starts a new window once the old one has passed', () => {
    const clock = new FakeClock('2027-03-01T09:00:00Z');
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 }, clock);
    expect(limiter.allow('a')).toBe(true);
    clock.advance(999);
    expect(limiter.allow('a')).toBe(false);
    clock.advance(1);
    expect(limiter.allow('a')).toBe(true);
  });

  it('does not count rejected attempts', () => {
    const clock = new FakeClock('2027-03-01T09:00:00Z');
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 }, clock);
    limiter.allow('a');
    for (let i = 0; i < 5; i++) limiter.allow('a');
    clock.advance(1000);
    expect(limiter.allow('a')).toBe(true);
  });
});
