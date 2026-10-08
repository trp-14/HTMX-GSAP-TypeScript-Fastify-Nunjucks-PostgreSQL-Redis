import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/plugin.js';
import { dashboardController } from '../controllers/dashboardController.js';

export async function overviewRoutes(app: FastifyInstance) {
  const ctl = dashboardController(app.container);
  app.get('/overview', { preHandler: requireAuth }, ctl.overview);
}
