import { randomBytes, createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { keys } from '../redis/keys.js';

export type SessionData = {
  userId: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  ip: string;
  userAgent: string;
};

export type SessionSummary = SessionData & { id: string; current: boolean };

/**
 * Server-side sessions in Redis. The browser only ever holds an opaque random id in an
 * HTTP-only cookie; the Redis key is a SHA-256 of that id, so a Redis dump cannot be replayed
 * as cookies. Sessions expire after an idle TTL (sliding) and an absolute lifetime.
 */
export class SessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly idleTtlSeconds: number,
    private readonly absoluteTtlSeconds: number,
  ) {}

  private static hash(id: string): string {
    return createHash('sha256').update(id).digest('base64url');
  }

  async create(
    userId: string,
    meta: { ip: string; userAgent: string },
  ): Promise<{ id: string; data: SessionData }> {
    const id = randomBytes(32).toString('base64url');
    const now = Date.now();
    const data: SessionData = {
      userId,
      csrfToken: randomBytes(32).toString('base64url'),
      createdAt: now,
      lastSeenAt: now,
      ip: meta.ip,
      userAgent: meta.userAgent.slice(0, 200),
    };
    const hashed = SessionStore.hash(id);
    await this.redis
      .multi()
      .set(keys.session(hashed), JSON.stringify(data), 'EX', this.idleTtlSeconds)
      .sadd(keys.userSessions(userId), hashed)
      .expire(keys.userSessions(userId), this.absoluteTtlSeconds)
      .exec();
    return { id, data };
  }

  /** Loads a session and slides its idle expiry. Returns null when missing or past its absolute lifetime. */
  async touch(id: string): Promise<SessionData | null> {
    const hashed = SessionStore.hash(id);
    const raw = await this.redis.get(keys.session(hashed));
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionData;
    const now = Date.now();
    if (now - data.createdAt > this.absoluteTtlSeconds * 1000) {
      await this.destroyHashed(hashed, data.userId);
      return null;
    }
    // Only rewrite once a minute to avoid a Redis write on every asset request.
    if (now - data.lastSeenAt > 60_000) {
      data.lastSeenAt = now;
      await this.redis.set(keys.session(hashed), JSON.stringify(data), 'EX', this.idleTtlSeconds);
    } else {
      await this.redis.expire(keys.session(hashed), this.idleTtlSeconds);
    }
    return data;
  }

  /** Checks a session still exists *without* sliding its expiry (used by long-lived SSE streams). */
  async isAlive(id: string): Promise<boolean> {
    return (await this.redis.exists(keys.session(SessionStore.hash(id)))) === 1;
  }

  async destroy(id: string): Promise<void> {
    const hashed = SessionStore.hash(id);
    const raw = await this.redis.get(keys.session(hashed));
    const userId = raw ? (JSON.parse(raw) as SessionData).userId : null;
    await this.destroyHashed(hashed, userId);
  }

  private async destroyHashed(hashed: string, userId: string | null): Promise<void> {
    const tx = this.redis.multi().del(keys.session(hashed), keys.flash(hashed));
    if (userId) tx.srem(keys.userSessions(userId), hashed);
    await tx.exec();
  }

  /** Lists a user's live sessions (for the Account page). Prunes ids whose session expired. */
  async listForUser(userId: string, currentId?: string): Promise<SessionSummary[]> {
    const hashedIds = await this.redis.smembers(keys.userSessions(userId));
    const currentHashed = currentId ? SessionStore.hash(currentId) : null;
    const result: SessionSummary[] = [];
    for (const hashed of hashedIds) {
      const raw = await this.redis.get(keys.session(hashed));
      if (!raw) {
        await this.redis.srem(keys.userSessions(userId), hashed);
        continue;
      }
      result.push({ ...(JSON.parse(raw) as SessionData), id: hashed, current: hashed === currentHashed });
    }
    return result.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  /** Revokes one of the user's sessions by its hashed id (as listed on the Account page). */
  async revokeHashed(userId: string, hashed: string): Promise<boolean> {
    const isMember = await this.redis.sismember(keys.userSessions(userId), hashed);
    if (!isMember) return false;
    await this.destroyHashed(hashed, userId);
    return true;
  }

  /** Invalidates every session of a user (password change, deactivation, role change). */
  async destroyAllForUser(userId: string, exceptId?: string): Promise<number> {
    const hashedIds = await this.redis.smembers(keys.userSessions(userId));
    const keep = exceptId ? SessionStore.hash(exceptId) : null;
    let removed = 0;
    for (const hashed of hashedIds) {
      if (hashed === keep) continue;
      await this.destroyHashed(hashed, userId);
      removed++;
    }
    return removed;
  }

  // ---- flash messages: genuinely short-lived state tied to the session ----

  async setFlash(id: string, flash: { type: 'success' | 'error' | 'info'; message: string }): Promise<void> {
    await this.redis.set(keys.flash(SessionStore.hash(id)), JSON.stringify(flash), 'EX', 60);
  }

  async takeFlash(id: string): Promise<{ type: string; message: string } | null> {
    const key = keys.flash(SessionStore.hash(id));
    const raw = await this.redis.getdel(key);
    return raw ? (JSON.parse(raw) as { type: string; message: string }) : null;
  }
}
