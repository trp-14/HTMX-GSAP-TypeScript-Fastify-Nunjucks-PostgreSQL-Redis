import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/plugin.js';
import { accountController } from '../controllers/accountController.js';

export async function accountRoutes(app: FastifyInstance) {
  const ctl = accountController(app.container);
  app.addHook('preHandler', requireAuth);
  app.get('/account', ctl.page);
  app.put('/account/profile', ctl.updateProfile);
  app.put('/account/password', ctl.changePassword);
  app.delete('/account/sessions/:id', ctl.revokeSession);
}
