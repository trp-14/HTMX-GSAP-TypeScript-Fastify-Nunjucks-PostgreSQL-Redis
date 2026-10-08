import type { FastifyInstance } from 'fastify';
import { publicRoutes } from './publicRoutes.js';
import { overviewRoutes } from './overviewRoutes.js';
import { requestRoutes } from './requestRoutes.js';
import { monitorRoutes } from './monitorRoutes.js';
import { productRoutes } from './productRoutes.js';
import { knowledgeRoutes } from './knowledgeRoutes.js';
import { notificationRoutes } from './notificationRoutes.js';
import { accountRoutes } from './accountRoutes.js';
import { adminRoutes } from './adminRoutes.js';

export async function registerRoutes(app: FastifyInstance) {
  app.get('/healthz', async () => {
    const { db, redis } = { db: app.container.deps.db, redis: app.container.redis.main };
    await Promise.all([db.query('SELECT 1'), redis.ping()]);
    return { status: 'ok', sseClients: app.container.hub.size };
  });

  await app.register(publicRoutes);
  await app.register(overviewRoutes);
  await app.register(requestRoutes);
  await app.register(monitorRoutes);
  await app.register(productRoutes);
  await app.register(knowledgeRoutes);
  await app.register(notificationRoutes);
  await app.register(accountRoutes);
  await app.register(adminRoutes);
}
