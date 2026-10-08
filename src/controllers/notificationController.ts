import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Container } from '../container.js';
import { actorOf } from '../auth/plugin.js';
import { redirect, trigger, wantsFragment } from '../middleware/htmx.js';

type IdParams = { Params: { id: string } };

export function notificationController(c: Container) {
  const { notifications } = c.services;

  /** Every mutation tells the page the new unread count via an HX-Trigger event. */
  async function announceCount(reply: FastifyReply, userId: string) {
    trigger(reply, { 'fd:unread': { count: await notifications.unreadCount(userId) } });
  }

  return {
    async page(
      req: FastifyRequest<{ Querystring: { filter?: string; page?: string } }>,
      reply: FastifyReply,
    ) {
      const actor = actorOf(req);
      const unreadOnly = req.query.filter === 'unread';
      const page = await notifications.list(
        actor.id,
        unreadOnly,
        Math.max(1, Number(req.query.page) || 1),
        15,
      );
      const ctx = {
        page,
        filter: unreadOnly ? 'unread' : 'all',
        query: { filter: unreadOnly ? 'unread' : undefined },
      };
      if (wantsFragment(req, 'notification-results'))
        return reply.render('partials/notifications/results.njk', ctx);
      return reply.render('pages/notifications.njk', ctx);
    },

    async drawer(req: FastifyRequest, reply: FastifyReply) {
      const actor = actorOf(req);
      const page = await notifications.list(actor.id, false, 1, 12);
      return reply.render('partials/notifications/drawer.njk', { page, variant: 'drawer' });
    },

    async count(req: FastifyRequest, reply: FastifyReply) {
      const count = await notifications.unreadCount(actorOf(req).id);
      return reply
        .type('text/plain')
        .header('Cache-Control', 'no-store')
        .send(count > 0 ? String(count) : '');
    },

    async markRead(
      req: FastifyRequest<IdParams & { Querystring: { variant?: string } }>,
      reply: FastifyReply,
    ) {
      const actor = actorOf(req);
      const n = await notifications.markRead(actor.id, req.params.id);
      await announceCount(reply, actor.id);
      return reply.render('partials/notifications/item.njk', {
        n,
        variant: req.query.variant === 'drawer' ? 'drawer' : 'page',
      });
    },

    async open(req: FastifyRequest<IdParams>, reply: FastifyReply) {
      const actor = actorOf(req);
      const link = await notifications.open(actor.id, req.params.id);
      return redirect(req, reply, link.startsWith('/') && !link.startsWith('//') ? link : '/notifications');
    },

    async markAllRead(req: FastifyRequest, reply: FastifyReply) {
      const actor = actorOf(req);
      await notifications.markAllRead(actor.id);
      await announceCount(reply, actor.id);
      if (req.headers['hx-target'] === 'notif-drawer-body') {
        const page = await notifications.list(actor.id, false, 1, 12);
        return reply.render('partials/notifications/drawer.njk', { page, variant: 'drawer' });
      }
      const page = await notifications.list(actor.id, false, 1, 15);
      return reply.render('partials/notifications/results.njk', { page, filter: 'all', query: {} });
    },

    async remove(req: FastifyRequest<IdParams>, reply: FastifyReply) {
      const actor = actorOf(req);
      await notifications.remove(actor.id, req.params.id);
      await announceCount(reply, actor.id);
      return reply.send('');
    },
  };
}
