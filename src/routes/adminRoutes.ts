import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../auth/plugin.js';
import { adminController } from '../controllers/adminController.js';

export async function adminRoutes(app: FastifyInstance) {
  const ctl = adminController(app.container);

  await app.register(async (scope) => {
    scope.addHook('preHandler', requirePermission('user:manage'));
    scope.get('/users', ctl.users);
    scope.get('/users/new', ctl.newUser);
    scope.post('/users', ctl.createUser);
    scope.get('/users/:id/edit', ctl.editUser);
    scope.put('/users/:id', ctl.updateUser);
    scope.put('/users/:id/active', ctl.setActive);
  });

  await app.register(async (scope) => {
    scope.addHook('preHandler', requirePermission('audit:read'));
    scope.get('/audit', ctl.audit);
  });

  await app.register(async (scope) => {
    scope.addHook('preHandler', requirePermission('settings:manage'));
    scope.get('/settings', ctl.settings);
    scope.put('/settings', ctl.updateSettings);
  });
}
