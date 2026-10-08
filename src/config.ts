import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_IDLE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 60 * 60),
  SESSION_ABSOLUTE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
  COOKIE_SECURE: bool.optional(),
  UPLOAD_DIR: z.string().default('./storage/uploads'),
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  REDIS_KEY_PREFIX: z.string().default('fd:'),
});

export type AppConfig = {
  env: 'development' | 'test' | 'production';
  isProduction: boolean;
  host: string;
  port: number;
  origin: string;
  logLevel: string;
  databaseUrl: string;
  redisUrl: string;
  redisKeyPrefix: string;
  session: { idleTtlSeconds: number; absoluteTtlSeconds: number; cookieName: string; secureCookie: boolean };
  uploads: { dir: string; maxBytes: number };
};

/** Loads and validates configuration from environment variables. Fails fast on invalid config. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const secureCookie = e.COOKIE_SECURE ?? isProduction;
  return {
    env: e.NODE_ENV,
    isProduction,
    host: e.HOST,
    port: e.PORT,
    origin: e.APP_ORIGIN.replace(/\/$/, ''),
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    redisKeyPrefix: e.REDIS_KEY_PREFIX,
    session: {
      idleTtlSeconds: e.SESSION_IDLE_TTL_SECONDS,
      absoluteTtlSeconds: e.SESSION_ABSOLUTE_TTL_SECONDS,
      // The __Host- prefix pins the cookie to this exact origin, but browsers only accept it with Secure.
      cookieName: secureCookie ? '__Host-fd_sid' : 'fd_sid',
      secureCookie,
    },
    uploads: { dir: e.UPLOAD_DIR, maxBytes: e.UPLOAD_MAX_BYTES },
  };
}
