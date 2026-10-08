import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type pg from 'pg';
import { Redis } from 'ioredis';
import pino from 'pino';
import { buildApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config.js';
import { createPool } from '../../src/db/pool.js';
import { migrate, resetDatabase } from '../../src/db/migrator.js';
import { seedDatabase } from '../../src/db/seed/seed.js';
import { InMemoryEventPublisher } from '../../src/events/publisher.js';
import { createRedisClients, type RedisClients } from '../../src/redis/client.js';

/**
 * Integration tests run the real Fastify app against real PostgreSQL and Redis
 * (TEST_DATABASE_URL / TEST_REDIS_URL). Events are captured in memory so tests can assert on
 * exactly what would have been published to Redis.
 */
export const TEST_PASSWORD = 'FlowDesk!2026';
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://flowdesk:flowdesk@localhost:5432/flowdesk_test';
const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';

export type TestContext = {
  app: FastifyInstance;
  db: pg.Pool;
  redis: RedisClients;
  events: InMemoryEventPublisher;
  config: AppConfig;
  close(): Promise<void>;
};

let seeded = false;

export async function createTestApp(
  overrides: Partial<Record<string, string>> = {},
  opts: { realtime?: boolean } = {},
): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL,
    REDIS_URL,
    APP_ORIGIN: 'http://localhost:3000',
    UPLOAD_DIR: './storage/test-uploads',
    REDIS_KEY_PREFIX: 'fdtest:',
    ...overrides,
  });
  const db = createPool(config.databaseUrl);
  const silent = pino({ level: 'silent' });
  const redis = createRedisClients(config.redisUrl, config.redisKeyPrefix, silent);
  if (!seeded) {
    await resetDatabase(db);
    await migrate(db);
    await seedDatabase(db, { password: TEST_PASSWORD });
    const flush = new Redis(config.redisUrl);
    await flush.flushdb();
    flush.disconnect();
    seeded = true;
  }
  const events = new InMemoryEventPublisher();
  // Realtime suites use the real Redis publisher and SSE hub; others capture events in memory.
  const app = await buildApp({
    config,
    db,
    redis,
    publisher: opts.realtime ? undefined : events,
    realtime: !!opts.realtime,
  });
  await app.ready();
  return {
    app,
    db,
    redis,
    events,
    config,
    async close() {
      await app.close();
      await redis.close();
      await db.end();
    },
  };
}

/** Re-seeds the database (for suites that mutate shared fixtures heavily). */
export async function reseed(ctx: TestContext) {
  await seedDatabase(ctx.db, { password: TEST_PASSWORD });
  await ctx.redis.main.flushdb();
}

export type Agent = {
  email: string;
  cookie: string;
  csrf: string;
  request(
    method: string,
    url: string,
    body?: Record<string, string>,
    headers?: Record<string, string>,
  ): Promise<LightMyRequestResponse>;
};

const form = (body: Record<string, string>) => new URLSearchParams(body).toString();

export function sessionCookie(res: LightMyRequestResponse, name = 'fd_sid'): string | null {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const found = list.find((c) => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`));
  return found ? found.split(';')[0]! : null;
}

export function loginRequest(
  app: FastifyInstance,
  email: string,
  password = TEST_PASSWORD,
  ip = '127.0.0.1',
) {
  return app.inject({
    method: 'POST',
    url: '/login',
    remoteAddress: ip,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: form({ email, password }),
  });
}

/** Signs in and returns an agent that sends the session cookie and CSRF token like the browser does. */
export async function signIn(app: FastifyInstance, email: string): Promise<Agent> {
  const res = await loginRequest(
    app,
    email,
    TEST_PASSWORD,
    `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  );
  const cookie = sessionCookie(res);
  if (!cookie) throw new Error(`login failed for ${email}: ${res.statusCode}`);
  const page = await app.inject({ method: 'GET', url: '/account', headers: { cookie } });
  const csrf = /"X-CSRF-Token": "([^"]+)"/.exec(page.body)?.[1];
  if (!csrf) throw new Error('no csrf token on page');
  return {
    email,
    cookie,
    csrf,
    request(method, url, body, headers = {}) {
      return app.inject({
        method: method as 'GET',
        url,
        headers: {
          cookie,
          'x-csrf-token': csrf,
          'hx-request': 'true',
          ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
          ...headers,
        },
        payload: body ? form(body) : undefined,
      });
    },
  };
}

export async function scalar<T = unknown>(db: pg.Pool, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  return Object.values(rows[0] ?? {})[0] as T;
}
