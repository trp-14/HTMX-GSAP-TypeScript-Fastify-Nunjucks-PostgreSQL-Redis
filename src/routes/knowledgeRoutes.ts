import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/plugin.js';
import { knowledgeController } from '../controllers/knowledgeController.js';

export async function knowledgeRoutes(app: FastifyInstance) {
  const ctl = knowledgeController(app.container);
  app.addHook('preHandler', requireAuth);
  app.get('/knowledge', ctl.index);
  app.get('/knowledge/:slug', ctl.article);
}
