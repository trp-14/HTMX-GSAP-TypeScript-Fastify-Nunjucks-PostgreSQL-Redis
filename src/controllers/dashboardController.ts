import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Container } from '../container.js';
import { actorOf } from '../auth/plugin.js';
import { notFound } from '../utils/errors.js';

const uuid = z.string().uuid();

export function dashboardController(c: Container) {
  const { dashboard } = c.services;

  return {
    async overview(req: FastifyRequest, reply: FastifyReply) {
      const actor = actorOf(req);
      const data = await dashboard.overview(actor);
      const max = Math.max(1, ...data.volume.map((v) => Math.max(v.created, v.completed)));
      // Sparkline geometry is computed here so the template only draws it.
      const w = 560;
      const h = 120;
      const step = w / Math.max(1, data.volume.length - 1);
      const y = (v: number) => (h - 10 - (v / max) * (h - 24)).toFixed(1);
      const created = data.volume.map((v, i) => `${(i * step).toFixed(1)},${y(v.created)}`).join(' ');
      const completed = data.volume.map((v, i) => `${(i * step).toFixed(1)},${y(v.completed)}`).join(' ');
      const hour = Number(
        new Intl.DateTimeFormat('en-GB', {
          hour: 'numeric',
          hourCycle: 'h23',
          timeZone: 'Asia/Jakarta',
        }).format(new Date()),
      );
      return reply.render('pages/overview.njk', {
        ...data,
        distributionTotal: Object.values(data.distribution).reduce((a, b) => a + b, 0),
        greeting:
          hour < 11
            ? 'Good morning'
            : hour < 15
              ? 'Good afternoon'
              : hour < 19
                ? 'Good evening'
                : 'Working late',
        spark: { w, h, created, completed, area: `0,${h} ${created} ${w},${h}`, max },
      });
    },

    async monitor(req: FastifyRequest, reply: FastifyReply) {
      const data = await dashboard.monitor(actorOf(req));
      if (req.headers['hx-request'] === 'true' && req.headers['hx-target'] === 'monitor-board') {
        return reply.render('partials/monitor/board.njk', data);
      }
      return reply.render('pages/monitor.njk', data);
    },

    async laneCard(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      if (!uuid.safeParse(req.params.id).success) throw notFound('Request');
      const r = await dashboard.laneCard(actorOf(req), req.params.id);
      if (!r) throw notFound('Request');
      return reply.render('partials/monitor/lane-card.njk', { r, isNew: true });
    },

    async watchItem(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      actorOf(req);
      if (!uuid.safeParse(req.params.id).success) throw notFound('Product');
      const p = await dashboard.watchItem(req.params.id);
      if (!p) throw notFound('Product');
      return reply.render('partials/monitor/watch-item.njk', { p, isNew: true });
    },

    async movements(req: FastifyRequest<{ Querystring: { after?: string } }>, reply: FastifyReply) {
      actorOf(req);
      const after = Math.max(0, Number(req.query.after) || 0);
      const items = await dashboard.movementsSince(after);
      return reply.render('partials/monitor/movement-items.njk', { items, isNew: true });
    },

    async activity(req: FastifyRequest<{ Querystring: { after?: string } }>, reply: FastifyReply) {
      const after = Math.max(0, Number(req.query.after) || 0);
      const items = await dashboard.activitySince(actorOf(req), after);
      return reply.render('partials/monitor/activity-items.njk', { items, isNew: true });
    },
  };
}
