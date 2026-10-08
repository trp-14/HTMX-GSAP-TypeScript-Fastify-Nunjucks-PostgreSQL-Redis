import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { migrate } from './db/migrator.js';
import { createRedisClients } from './redis/client.js';
import { loadDotEnv } from './utils/env.js';
import pino from 'pino';

loadDotEnv();
const config = loadConfig();
const bootLog = pino({ level: config.logLevel === 'silent' ? 'silent' : 'info' });

const db = createPool(config.databaseUrl);
db.on('error', (err) => bootLog.error({ err }, 'postgres pool error'));
const redis = createRedisClients(config.redisUrl, config.redisKeyPrefix, bootLog);

if (process.env.MIGRATE_ON_START === 'true') {
  await migrate(db, (m) => bootLog.info(m));
}

const app = await buildApp({ config, db, redis });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    await app.close();
    await redis.close();
    await db.end();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => app.log.error({ err }, 'unhandled promise rejection'));

await app.listen({ host: config.host, port: config.port });
