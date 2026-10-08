import type { Redis } from 'ioredis';
import { keys } from './keys.js';

export type RateLimitRule = { bucket: string; limit: number; windowSeconds: number };
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

// INCR + EXPIRE executed atomically; the window starts at the first hit.
const SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

/** Fixed-window rate limiter stored in Redis so limits hold across every app instance. */
export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  async hit(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
    const [count, ttl] = (await this.redis.eval(
      SCRIPT,
      1,
      keys.rateLimit(rule.bucket, identifier),
      String(rule.windowSeconds),
    )) as [number, number];
    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds,
    };
  }

  async reset(rule: RateLimitRule, identifier: string): Promise<void> {
    await this.redis.del(keys.rateLimit(rule.bucket, identifier));
  }
}

export const RATE_LIMITS = {
  loginByIp: { bucket: 'login-ip', limit: 20, windowSeconds: 15 * 60 },
  loginByEmail: { bucket: 'login-email', limit: 6, windowSeconds: 15 * 60 },
  register: { bucket: 'register', limit: 5, windowSeconds: 60 * 60 },
  passwordChange: { bucket: 'password', limit: 5, windowSeconds: 15 * 60 },
  upload: { bucket: 'upload', limit: 30, windowSeconds: 10 * 60 },
  inventory: { bucket: 'inventory', limit: 120, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;
