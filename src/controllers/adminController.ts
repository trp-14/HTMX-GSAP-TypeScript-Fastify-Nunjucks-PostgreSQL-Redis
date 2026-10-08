import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Container } from '../container.js';
import { actorOf } from '../auth/plugin.js';
import { ROLE_DESCRIPTIONS, ROLES } from '../auth/permissions.js';
import { redirect, toast, wantsFragment } from '../middleware/htmx.js';
import { UserListQuerySchema } from '../services/userService.js';
import { AppError } from '../utils/errors.js';

type Body = { Body: Record<string, unknown> };
type IdParams = { Params: { id: string } };

const ROLE_OPTIONS = ROLES.map((r) => ({
  value: r,
  label: r[0] + r.slice(1).toLowerCase(),
  description: ROLE_DESCRIPTIONS[r],
}));

const AuditQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  actor: z.string().uuid().optional().catch(undefined),
  entity: z
    .string()
    .regex(/^[a-z_]+$/)
    .optional()
    .catch(undefined),
  action: z
    .string()
    .regex(/^[A-Z_]+$/)
    .optional()
    .catch(undefined),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

export function adminController(c: Container) {
  const { users, audit, settings } = c.services;

  async function userFormContext(extra: Record<string, unknown>) {
    const departments = await users.departments();
    return {
      departmentOptions: departments.map((d) => ({ value: d.id, label: d.name })),
      roleOptions: ROLE_OPTIONS,
      ...extra,
    };
  }

  return {
    // ---------------------------------------------------------------- users
    async users(req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
      const actor = actorOf(req);
      const query = UserListQuerySchema.parse(req.query);
      const page = await users.list(actor, query);
      const ctx = { page, query: req.query };
      if (wantsFragment(req, 'user-results')) return reply.render('partials/users/results.njk', ctx);
      return reply.render('pages/users/index.njk', await userFormContext(ctx));
    },

    async newUser(_req: FastifyRequest, reply: FastifyReply) {
      return reply.render(
        'pages/users/form.njk',
        await userFormContext({ values: { roles: ['EMPLOYEE'] }, creating: true }),
      );
    },

    async createUser(req: FastifyRequest<Body>, reply: FastifyReply) {
      try {
        const { id, temporaryPassword } = await users.create(actorOf(req), req.body ?? {});
        const u = await users.get(actorOf(req), id);
        return reply.render('pages/users/created.njk', { created: u, temporaryPassword });
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          return reply
            .code(422)
            .render(
              'pages/users/form.njk',
              await userFormContext({ values: normaliseRoles(req.body), errors: err.fields, creating: true }),
            );
        }
        throw err;
      }
    },

    async editUser(req: FastifyRequest<IdParams>, reply: FastifyReply) {
      const u = await users.get(actorOf(req), req.params.id);
      return reply.render(
        'pages/users/form.njk',
        await userFormContext({ target: u, values: u, creating: false }),
      );
    },

    async updateUser(req: FastifyRequest<IdParams & Body>, reply: FastifyReply) {
      const actor = actorOf(req);
      try {
        const u = await users.update(actor, req.params.id, req.body ?? {});
        await c.deps.sessions.setFlash(req.session!.id, {
          type: 'success',
          message: `${u.fullName} updated.`,
        });
        return redirect(req, reply, '/users');
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          const target = await users.get(actor, req.params.id);
          return reply.code(422).render(
            'pages/users/form.njk',
            await userFormContext({
              target,
              values: { ...target, ...normaliseRoles(req.body) },
              errors: err.fields,
              creating: false,
            }),
          );
        }
        throw err;
      }
    },

    async setActive(req: FastifyRequest<IdParams & Body>, reply: FastifyReply) {
      const active = (req.body ?? {}).active === 'true';
      const u = await users.setActive(actorOf(req), req.params.id, active);
      toast(reply, { type: 'success', message: `${u.fullName} ${active ? 'reactivated' : 'deactivated'}.` });
      return reply.render('partials/users/row.njk', { u });
    },

    // ---------------------------------------------------------------- audit
    async audit(req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
      const actor = actorOf(req);
      const q = AuditQuerySchema.parse(req.query);
      const data = await audit.search(
        actor,
        { q: q.q, actorId: q.actor, entityType: q.entity, action: q.action, from: q.from, to: q.to },
        q.page ?? 1,
      );
      const ctx = { ...data, query: req.query };
      if (wantsFragment(req, 'audit-results')) return reply.render('partials/audit/results.njk', ctx);
      return reply.render('pages/audit.njk', ctx);
    },

    // ---------------------------------------------------------------- settings
    async settings(_req: FastifyRequest, reply: FastifyReply) {
      return reply.render('pages/settings.njk', { values: await settings.get() });
    },

    async updateSettings(req: FastifyRequest<Body>, reply: FastifyReply) {
      try {
        const values = await settings.update(actorOf(req), req.body ?? {});
        toast(reply, { type: 'success', message: 'Settings saved. Cached configuration refreshed.' });
        return reply.render('partials/settings-form.njk', { values });
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          return reply
            .code(422)
            .render('partials/settings-form.njk', { values: req.body, errors: err.fields });
        }
        throw err;
      }
    },
  };
}

function normaliseRoles(body: Record<string, unknown> | undefined) {
  const roles = body?.roles;
  return { ...body, roles: Array.isArray(roles) ? roles : roles ? [roles] : [] };
}
