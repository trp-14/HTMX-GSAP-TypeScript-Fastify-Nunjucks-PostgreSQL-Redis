import type { Redis } from 'ioredis';
import { keys } from './keys.js';

/**
 * Who is currently watching a live page. A sorted set scored by last heartbeat; members older
 * than the window are pruned on read. Purely ephemeral — exactly the kind of state Redis is for.
 */
export class Presence {
  constructor(
    private readonly redis: Redis,
    private readonly windowSeconds = 70,
  ) {}

  async touch(room: string, member: string): Promise<void> {
    await this.redis.zadd(keys.presence(room), Date.now(), member);
    await this.redis.expire(keys.presence(room), this.windowSeconds * 2);
  }

  async leave(room: string, member: string): Promise<void> {
    await this.redis.zrem(keys.presence(room), member);
  }

  async count(room: string): Promise<number> {
    const key = keys.presence(room);
    await this.redis.zremrangebyscore(key, 0, Date.now() - this.windowSeconds * 1000);
    return this.redis.zcard(key);
  }
}
