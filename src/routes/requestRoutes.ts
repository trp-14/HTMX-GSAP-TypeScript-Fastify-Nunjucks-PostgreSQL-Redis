import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/plugin.js';
import { requestController } from '../controllers/requestController.js';

export async function requestRoutes(app: FastifyInstance) {
  const ctl = requestController(app.container);
  app.addHook('preHandler', requireAuth);

  app.get('/requests', ctl.list);
  app.get('/requests/new', ctl.newForm);
  app.post('/requests', ctl.create);
  app.get('/requests/:number', ctl.show);
  app.get('/requests/:number/edit', ctl.editForm);
  app.put('/requests/:number', ctl.update);
  app.delete('/requests/:number', ctl.remove);

  // Workflow engine
  app.get('/requests/:number/workflow', ctl.workflowFragment);
  app.get('/requests/:number/transitions/:action', ctl.transitionModal);
  app.post('/requests/:number/transitions/:action', ctl.transition);

  app.put('/requests/:number/assignee', ctl.assign);
  app.post('/requests/:number/comments', ctl.comment);
  app.post('/requests/:number/attachments', ctl.upload);
  app.get('/attachments/:id/download', ctl.download);
  app.delete('/attachments/:id', ctl.removeAttachment);
}
