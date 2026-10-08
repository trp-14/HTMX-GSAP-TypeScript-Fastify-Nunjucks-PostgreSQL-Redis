import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/plugin.js';
import { notificationController } from '../controllers/notificationController.js';

export async function notificationRoutes(app: FastifyInstance) {
  const ctl = notificationController(app.container);
  app.addHook('preHandler', requireAuth);
  app.get('/notifications', ctl.page);
  app.get('/notifications/drawer', ctl.drawer);
  app.get('/notifications/count', ctl.count);
  app.post('/notifications/read-all', ctl.markAllRead);
  app.put('/notifications/:id/read', ctl.markRead);
  app.post('/notifications/:id/open', ctl.open);
  app.delete('/notifications/:id', ctl.remove);
}
