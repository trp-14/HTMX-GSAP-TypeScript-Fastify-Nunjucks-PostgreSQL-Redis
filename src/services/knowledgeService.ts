import { z } from 'zod';
import { knowledgeRepository } from '../repositories/knowledgeRepository.js';
import { notFound } from '../utils/errors.js';
import { highlightSnippet, renderMarkdown } from '../utils/markdown.js';
import type { ServiceDeps } from './types.js';

export const KnowledgeQuerySchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  category: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

/** Content-heavy Knowledge Center: Postgres full-text search, cached categories, rendered articles. */
export class KnowledgeService {
  constructor(private readonly deps: ServiceDeps) {}

  categories() {
    return this.deps.cache.getOrSet('kb-categories', 900, () => knowledgeRepository.categories(this.deps.db));
  }

  async search(query: z.output<typeof KnowledgeQuerySchema>) {
    const categories = await this.categories();
    const category = query.category ? categories.find((c) => c.slug === query.category) : undefined;
    const results = await knowledgeRepository.search(
      this.deps.db,
      { q: query.q, categoryId: category?.id },
      query.page ?? 1,
      8,
    );
    return {
      categories,
      category,
      results: {
        ...results,
        items: results.items.map((a) => ({
          ...a,
          snippetHtml: a.headline ? highlightSnippet(a.headline) : null,
        })),
      },
    };
  }

  async article(slug: string) {
    if (!/^[a-z0-9-]{1,100}$/.test(slug)) throw notFound('Article');
    const article = await knowledgeRepository.findBySlug(this.deps.db, slug);
    if (!article) throw notFound('Article');
    const [related, categories] = await Promise.all([
      knowledgeRepository.related(this.deps.db, article, 3),
      this.categories(),
    ]);
    const { html, headings } = renderMarkdown(article.bodyMarkdown);
    return { article, html, headings, related, categories };
  }

  latest(limit = 4) {
    return knowledgeRepository.latest(this.deps.db, limit);
  }
}
