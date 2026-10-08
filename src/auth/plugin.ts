import { timingSafeEqual } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Permission } from './permissions.js';
import type { SessionData } from './sessionStore.js';
import type { Actor } from '../services/types.js';
import type { Container } from '../container.js';
import { isHtmx } from '../middleware/htmx.js';
import { AppError, forbidden } from '../utils/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    session: { id: string; data: SessionData } | null;
    actor: Actor | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function tokensMatch(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Session + CSRF plugin.
 *  - Loads the Redis session from the HTTP-only cookie and the principal from PostgreSQL.
 *  - CSRF: synchronizer token (per-session, sent by HTMX as X-CSRF-Token or by forms as _csrf)
 *    plus an Origin check on every state-changing request; SameSite=Lax cookies as a third layer.
 */
export default fp(async function authPlugin(app: FastifyInstance, opts: { container: Container }) {
  const { config } = opts.container.deps;
  const { sessions } = opts.container.deps;
  const { auth } = opts.container.services;

  app.decorateRequest('session', null);
  app.decorateRequest('actor', null);

  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/assets/') || req.url === '/favicon.svg' || req.url === '/healthz') return;
    const sid = req.cookies[config.session.cookieName];
    if (!sid) return;
    const data = await sessions.touch(sid);
    const principal = data ? await auth.principal(data.userId) : null;
    if (!data || !principal) {
      if (data) await sessions.destroy(sid);
      clearSessionCookie(reply, config);
      return;
    }
    req.session = { id: sid, data };
    req.actor = { ...principal, ip: req.ip };
  });

  app.addHook('preHandler', async (req) => {
    if (SAFE_METHODS.has(req.method)) return;
    // 1. Origin check — browsers always send Origin on cross-site POST/PUT/DELETE.
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
      let host: string;
      try {
        host = new URL(origin).host;
      } catch {
        throw forbidden('Cross-site request blocked.');
      }
      if (host !== req.headers.host && origin !== config.origin)
        throw forbidden('Cross-site request blocked.');
    }
    // 2. Synchronizer token for authenticated sessions.
    if (req.session) {
      const header = req.headers['x-csrf-token'];
      const fromHeader = typeof header === 'string' ? header : undefined;
      const fromBody = (req.body as Record<string, unknown> | undefined)?._csrf;
      const token = fromHeader ?? (typeof fromBody === 'string' ? fromBody : undefined);
      if (!tokensMatch(token, req.session.data.csrfToken)) {
        req.log.warn({ url: req.url }, 'csrf token mismatch');
        throw new AppError(
          403,
          'CSRF',
          'Your session token is invalid or expired. Reload the page and try again.',
        );
      }
    }
  });
});

export function setSessionCookie(
  reply: FastifyReply,
  config: Container['deps']['config'],
  sessionId: string,
) {
  reply.setCookie(config.session.cookieName, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.session.secureCookie,
    path: '/',
    maxAge: config.session.absoluteTtlSeconds,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Container['deps']['config']) {
  reply.clearCookie(config.session.cookieName, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.session.secureCookie,
  });
}

/** preHandler: requires a signed-in user. Pages redirect to /login; HTMX gets HX-Redirect. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (req.actor) return;
  const next = encodeURIComponent(req.url);
  if (isHtmx(req)) {
    reply.header('HX-Redirect', `/login?next=${next}`);
    return reply.code(401).send();
  }
  if (req.method === 'GET') return reply.redirect(`/login?next=${next}`);
  return reply.code(401).type('text/plain').send('Unauthorized');
}

/** preHandler factory: requires a permission (checked on the server, regardless of what the UI shows). */
export function requirePermission(permission: Permission) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.actor) return requireAuth(req, reply);
    if (!req.actor.permissions.has(permission)) throw forbidden();
  };
}

/** Narrowing helper for handlers behind requireAuth. */
export function actorOf(req: FastifyRequest): Actor {
  if (!req.actor) throw new AppError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  return req.actor;
}
