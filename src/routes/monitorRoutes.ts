import type { FastifyInstance } from 'fastify';
import { requireAuth, requirePermission } from '../auth/plugin.js';
import { dashboardController } from '../controllers/dashboardController.js';
import { realtimeController } from '../controllers/realtimeController.js';

export async function monitorRoutes(app: FastifyInstance) {
  const ctl = dashboardController(app.container);
  const rt = realtimeController(app.container);

  /** Server-Sent Events: Redis Pub/Sub → this instance's hub → browser. */
  await app.register(async (scope) => {
    scope.addHook('preHandler', requireAuth);
    scope.get('/events/stream', rt.stream);
  });

  await app.register(async (scope) => {
    scope.addHook('preHandler', requirePermission('monitor:view'));
    scope.get('/monitor', ctl.monitor);
    scope.get('/monitor/requests/:id/card', ctl.laneCard);
    scope.get('/monitor/products/:id/watch', ctl.watchItem);
    scope.get('/monitor/activity', ctl.activity);
    scope.get('/monitor/movements', ctl.movements);
  });
}
