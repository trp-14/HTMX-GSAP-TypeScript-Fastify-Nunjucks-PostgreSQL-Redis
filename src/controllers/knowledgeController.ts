import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Container } from '../container.js';
import { wantsFragment } from '../middleware/htmx.js';
import { KnowledgeQuerySchema } from '../services/knowledgeService.js';

export function knowledgeController(c: Container) {
  const { knowledge } = c.services;
  return {
    async index(req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
      const query = KnowledgeQuerySchema.parse(req.query);
      const data = await knowledge.search(query);
      const ctx = { ...data, query: { q: query.q, category: query.category } };
      if (wantsFragment(req, 'kb-results')) return reply.render('partials/knowledge/results.njk', ctx);
      return reply.render('pages/knowledge/index.njk', ctx);
    },

    async article(req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) {
      return reply.render('pages/knowledge/article.njk', await knowledge.article(req.params.slug));
    },
  };
}
