import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Container } from '../container.js';
import { clearSessionCookie, setSessionCookie } from '../auth/plugin.js';
import { redirect } from '../middleware/htmx.js';
import { AppError } from '../utils/errors.js';

/** Only allow same-site relative paths as post-login destinations (no open redirects). */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && /^\/(?!\/)[\w\-/?=&%.#]*$/.test(next) && !next.startsWith('/login')
    ? next
    : '/overview';
}

/**
 * Form failures re-render the page. 422 is swapped by HTMX (see htmx-config); 403/429 are not swapped
 * and is surfaced as a toast from the X-Error-Message header instead.
 */
function formFailure(reply: FastifyReply, err: AppError) {
  if (err.statusCode === 401 || err.statusCode === 422) reply.code(422);
  else reply.code(err.statusCode).header('X-Error-Message', encodeURIComponent(err.message));
}

const DEMO_ACCOUNTS = [
  { email: 'sinta.wirawan@arunika.co.id', role: 'Employee' },
  { email: 'raka.pratama@arunika.co.id', role: 'Manager' },
  { email: 'dewi.lestari@arunika.co.id', role: 'Operations' },
  { email: 'admin@arunika.co.id', role: 'Admin' },
];

export function authController(c: Container) {
  const { auth, users } = c.services;
  const { config, sessions } = c.deps;
  const meta = (req: FastifyRequest) => ({ ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') });

  return {
    async landing(req: FastifyRequest, reply: FastifyReply) {
      return reply.render('pages/landing.njk', {
        signedIn: !!req.actor,
        stats: await c.services.dashboard.publicStats(),
      });
    },

    async loginPage(req: FastifyRequest<{ Querystring: { next?: string } }>, reply: FastifyReply) {
      if (req.actor) return reply.redirect(safeNext(req.query.next));
      return reply.render('pages/login.njk', {
        next: safeNext(req.query.next),
        values: {},
        demoAccounts: config.isProduction ? [] : DEMO_ACCOUNTS,
        demoPassword: config.isProduction ? '' : (process.env.SEED_PASSWORD ?? ''),
      });
    },

    async login(req: FastifyRequest<{ Body: Record<string, string> }>, reply: FastifyReply) {
      const body = req.body ?? {};
      try {
        const { sessionId } = await auth.login(body, meta(req));
        if (req.session) await sessions.destroy(req.session.id); // rotate any pre-existing session
        setSessionCookie(reply, config, sessionId);
        return redirect(req, reply, safeNext(body.next));
      } catch (err) {
        if (err instanceof AppError && [401, 403, 422, 429].includes(err.statusCode)) {
          formFailure(reply, err);
          return reply.render('pages/login.njk', {
            next: safeNext(body.next),
            values: { email: body.email },
            errors: err.fields ?? { _form: err.message },
            demoAccounts: config.isProduction ? [] : DEMO_ACCOUNTS,
            demoPassword: config.isProduction ? '' : (process.env.SEED_PASSWORD ?? ''),
          });
        }
        throw err;
      }
    },

    async registerPage(req: FastifyRequest, reply: FastifyReply) {
      if (req.actor) return reply.redirect('/overview');
      return reply.render('pages/register.njk', { values: {}, departments: await users.departments() });
    },

    async register(req: FastifyRequest<{ Body: Record<string, string> }>, reply: FastifyReply) {
      try {
        const { sessionId } = await auth.register(req.body ?? {}, meta(req));
        setSessionCookie(reply, config, sessionId);
        await sessions.setFlash(sessionId, {
          type: 'success',
          message: 'Welcome to FlowDesk! Your account is ready.',
        });
        return redirect(req, reply, '/overview');
      } catch (err) {
        if (err instanceof AppError && [403, 422, 429].includes(err.statusCode)) {
          const { password: _p, confirmPassword: _c, ...values } = req.body ?? {};
          formFailure(reply, err);
          return reply.render('pages/register.njk', {
            values,
            errors: err.fields ?? { _form: err.message },
            departments: await users.departments(),
          });
        }
        throw err;
      }
    },

    async logout(req: FastifyRequest, reply: FastifyReply) {
      if (req.session) await auth.logout(req.session.id, req.actor);
      clearSessionCookie(reply, config);
      return reply.code(303).redirect('/login');
    },
  };
}
