import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../auth/plugin.js';
import { productController } from '../controllers/productController.js';

export async function productRoutes(app: FastifyInstance) {
  const ctl = productController(app.container);

  // Read access
  await app.register(async (scope) => {
    scope.addHook('preHandler', requirePermission('product:read'));
    scope.get('/products', ctl.list);
    scope.get('/products/:id', ctl.show);
    scope.get('/products/:id/stock', ctl.stock);
    scope.get('/products/:id/image', ctl.image);
  });

  // Catalogue management (admin)
  await app.register(async (scope) => {
    scope.addHook('preHandler', requirePermission('product:manage'));
    scope.get('/products/new', ctl.newForm);
    scope.post('/products', ctl.create);
    scope.get('/products/:id/edit', ctl.editForm);
    scope.put('/products/:id', ctl.update);
    scope.delete('/products/:id', ctl.remove);
    scope.post('/products/:id/image', ctl.uploadImage);
  });

  // Inventory movements (operations)
  await app.register(async (scope) => {
    scope.addHook('preHandler', requirePermission('inventory:adjust'));
    scope.post('/products/:id/movements', ctl.adjust);
  });
}
