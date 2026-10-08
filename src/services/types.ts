import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../config.js';
import type { Permission, Role } from '../auth/permissions.js';
import type { SessionStore } from '../auth/sessionStore.js';
import type { EventPublisher } from '../events/publisher.js';
import type { Cache } from '../redis/cache.js';
import type { RateLimiter } from '../redis/rateLimiter.js';

/** The authenticated user, loaded from PostgreSQL on every request. Never built from browser input. */
export type Principal = {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  roles: Role[];
  permissions: ReadonlySet<Permission>;
};

/** What a service needs to know about who is acting. */
export type Actor = Principal & { ip: string | null };

export type ServiceDeps = {
  config: AppConfig;
  db: pg.Pool;
  publisher: EventPublisher;
  cache: Cache;
  sessions: SessionStore;
  rateLimiter: RateLimiter;
  log: FastifyBaseLogger;
};

export function can(actor: Pick<Principal, 'permissions'>, permission: Permission): boolean {
  return actor.permissions.has(permission);
}
