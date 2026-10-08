import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Container } from '../container.js';
import { actorOf } from '../auth/plugin.js';
import { toast } from '../middleware/htmx.js';
import { AppError } from '../utils/errors.js';

type Body = { Body: Record<string, unknown> };

export function accountController(c: Container) {
  const { auth, users } = c.services;
  const { sessions } = c.deps;

  async function context(req: FastifyRequest, extra: Record<string, unknown> = {}) {
    const actor = actorOf(req);
    const [departments, activeSessions] = await Promise.all([
      users.departments(),
      sessions.listForUser(actor.id, req.session!.id),
    ]);
    return { departments, sessions: activeSessions, profile: actor, ...extra };
  }

  return {
    async page(req: FastifyRequest, reply: FastifyReply) {
      return reply.render('pages/account.njk', await context(req));
    },

    async updateProfile(req: FastifyRequest<Body>, reply: FastifyReply) {
      const actor = actorOf(req);
      try {
        await auth.updateProfile(actor, req.body ?? {});
        toast(reply, { type: 'success', message: 'Profile saved.' });
        const fresh = await auth.principal(actor.id);
        return reply.render('partials/account/profile-form.njk', await context(req, { profile: fresh }));
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          return reply
            .code(422)
            .render(
              'partials/account/profile-form.njk',
              await context(req, { profile: { ...actor, ...req.body }, errors: err.fields }),
            );
        }
        throw err;
      }
    },

    async changePassword(req: FastifyRequest<Body>, reply: FastifyReply) {
      const actor = actorOf(req);
      try {
        const revoked = await auth.changePassword(actor, req.session!.id, req.body ?? {});
        toast(reply, {
          type: 'success',
          message: `Password changed.${revoked ? ` Signed out ${revoked} other session(s).` : ''}`,
        });
        return reply.render('partials/account/password-form.njk', await context(req, { done: true }));
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          return reply
            .code(422)
            .render('partials/account/password-form.njk', await context(req, { errors: err.fields }));
        }
        throw err;
      }
    },

    async revokeSession(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      const actor = actorOf(req);
      await sessions.revokeHashed(actor.id, req.params.id);
      toast(reply, { type: 'success', message: 'Session signed out.' });
      return reply.render('partials/account/sessions.njk', await context(req));
    },
  };
}
