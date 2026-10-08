import { Redis } from 'ioredis';
import { loadDotEnv } from '../../utils/env.js';
import { createPool } from '../pool.js';
import { seedDatabase } from '../seed/seed.js';

loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
  throw new Error('Refusing to seed a production database (set ALLOW_PRODUCTION_SEED=true to override).');
}
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 10) throw new Error('SEED_PASSWORD must be set (min. 10 characters)');

const pool = createPool(url);
try {
  await seedDatabase(pool, { password, log: (m) => console.log(m) });
  // Cached read models (categories, settings) refer to the old rows — drop them.
  if (process.env.REDIS_URL) {
    const prefix = process.env.REDIS_KEY_PREFIX ?? 'fd:';
    const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      const stale = await redis.keys(`${prefix}cache:*`);
      if (stale.length) await redis.del(...stale);
      console.log(`cleared ${stale.length} cached entr${stale.length === 1 ? 'y' : 'ies'}`);
    } catch (err) {
      console.warn(`could not clear Redis cache: ${(err as Error).message}`);
    } finally {
      redis.disconnect();
    }
  }
} finally {
  await pool.end();
}
