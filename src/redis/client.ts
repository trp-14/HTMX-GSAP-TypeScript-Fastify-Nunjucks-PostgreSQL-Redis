import { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';

export type RedisClients = {
  /** General-purpose commands: sessions, cache, rate limits, presence. */
  main: Redis;
  /** Dedicated connection in subscriber mode (a subscribed connection cannot run other commands). */
  subscriber: Redis;
  close(): Promise<void>;
};

export function createRedisClients(url: string, keyPrefix: string, log: FastifyBaseLogger): RedisClients {
  const common = { maxRetriesPerRequest: 3, enableAutoPipelining: true, lazyConnect: false } as const;
  const main = new Redis(url, { ...common, keyPrefix, connectionName: 'flowdesk:main' });
  // Pub/Sub channel names are not affected by keyPrefix; the publisher prefixes channels itself.
  // No ready check: once PSUBSCRIBE is issued the connection may only run subscriber commands,
  // and ioredis re-subscribes automatically after reconnecting.
  const subscriber = new Redis(url, {
    ...common,
    enableReadyCheck: false,
    connectionName: 'flowdesk:subscriber',
  });

  for (const [name, client] of [
    ['main', main],
    ['subscriber', subscriber],
  ] as const) {
    client.on('error', (err) => log.error({ err, redis: name }, 'redis connection error'));
    client.on('reconnecting', () => log.warn({ redis: name }, 'redis reconnecting'));
  }

  return {
    main,
    subscriber,
    async close() {
      await Promise.allSettled([main.quit(), subscriber.quit()]);
    },
  };
}
