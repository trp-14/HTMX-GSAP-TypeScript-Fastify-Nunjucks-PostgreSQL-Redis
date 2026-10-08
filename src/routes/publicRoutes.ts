import type { FastifyInstance } from 'fastify';
import { authController } from '../controllers/authController.js';

export async function publicRoutes(app: FastifyInstance) {
  const ctl = authController(app.container);
  app.get('/', ctl.landing);
  app.get('/login', ctl.loginPage);
  app.post('/login', ctl.login);
  app.get('/register', ctl.registerPage);
  app.post('/register', ctl.register);
  app.post('/logout', ctl.logout);
}
