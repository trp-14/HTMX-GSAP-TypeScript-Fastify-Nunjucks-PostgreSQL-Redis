import type { Redis } from 'ioredis';
import { keys } from './keys.js';

/**
 * Read-through cache for small, read-heavy, rarely changing data (categories, settings).
 * Writers call `invalidate` after committing the PostgreSQL change.
 */
export class Cache {
  constructor(private readonly redis: Redis) {}

  async getOrSet<T>(name: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.redis.get(keys.cache(name));
      if (hit !== null) return JSON.parse(hit) as T;
    } catch {
      // Redis unavailable: fall through to the database.
    }
    const value = await load();
    this.redis.set(keys.cache(name), JSON.stringify(value), 'EX', ttlSeconds).catch(() => undefined);
    return value;
  }

  async invalidate(...names: string[]): Promise<void> {
    if (names.length) await this.redis.del(...names.map(keys.cache));
  }
}
