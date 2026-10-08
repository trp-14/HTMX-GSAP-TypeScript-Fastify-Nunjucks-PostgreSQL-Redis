import type { Queryable } from '../db/pool.js';
import { offsetFor, toPage, type Page } from '../utils/pagination.js';

export type KbCategory = {
  id: number;
  slug: string;
  name: string;
  description: string;
  position: number;
  articleCount: number;
};

export type KbArticleSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  readingMinutes: number;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  authorName: string | null;
  publishedAt: Date;
  updatedAt: Date;
  headline?: string | null;
};

export type KbArticle = KbArticleSummary & { bodyMarkdown: string };

const SUMMARY_COLS = `a.id, a.slug, a.title, a.summary, a.tags, a.reading_minutes AS "readingMinutes",
  a.category_id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName", u.full_name AS "authorName",
  a.published_at AS "publishedAt", a.updated_at AS "updatedAt"`;
const FROM = `FROM kb_articles a JOIN kb_categories c ON c.id = a.category_id LEFT JOIN users u ON u.id = a.author_id`;

export const knowledgeRepository = {
  async categories(db: Queryable): Promise<KbCategory[]> {
    const { rows } = await db.query<KbCategory>(
      `SELECT c.id, c.slug, c.name, c.description, c.position, count(a.id)::int AS "articleCount"
       FROM kb_categories c LEFT JOIN kb_articles a ON a.category_id = c.id
       GROUP BY c.id ORDER BY c.position, c.name`,
    );
    return rows;
  },

  /** Full-text search ranked by ts_rank, with highlighted snippets; falls back to recency when no query. */
  async search(
    db: Queryable,
    f: { q?: string; categoryId?: number },
    page: number,
    pageSize: number,
  ): Promise<Page<KbArticleSummary>> {
    const params: unknown[] = [];
    const where: string[] = [];
    let rank = 'a.published_at';
    let headline = 'NULL';
    if (f.q) {
      params.push(f.q);
      const n = params.length;
      where.push(
        `(a.search_vector @@ websearch_to_tsquery('english', $${n}) OR a.title ILIKE '%' || $${n} || '%')`,
      );
      rank = `ts_rank(a.search_vector, websearch_to_tsquery('english', $${n}))`;
      headline = `ts_headline('english', a.summary || ' ' || a.body_markdown, websearch_to_tsquery('english', $${n}),
                  'StartSel=[[, StopSel=]], MaxWords=28, MinWords=12, ShortWord=3, MaxFragments=1')`;
    }
    if (f.categoryId) {
      params.push(f.categoryId);
      where.push(`a.category_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await db.query<{ n: number }>(`SELECT count(*)::int AS n ${FROM} ${whereSql}`, params))
      .rows[0]!.n;
    const { rows } = await db.query<KbArticleSummary>(
      `SELECT ${SUMMARY_COLS}, ${headline} AS headline ${FROM} ${whereSql}
       ORDER BY ${rank} DESC, a.title LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offsetFor(page, pageSize)],
    );
    return toPage(rows, total, page, pageSize);
  },

  async findBySlug(db: Queryable, slug: string): Promise<KbArticle | null> {
    const { rows } = await db.query<KbArticle>(
      `SELECT ${SUMMARY_COLS}, a.body_markdown AS "bodyMarkdown" ${FROM} WHERE a.slug = $1`,
      [slug],
    );
    return rows[0] ?? null;
  },

  /** Related = same category or overlapping tags, scored by tag overlap. */
  async related(db: Queryable, article: KbArticle, limit = 3): Promise<KbArticleSummary[]> {
    const { rows } = await db.query<KbArticleSummary>(
      `SELECT ${SUMMARY_COLS} ${FROM}
       WHERE a.id <> $1 AND (a.category_id = $2 OR a.tags && $3::text[])
       ORDER BY cardinality(ARRAY(SELECT unnest(a.tags) INTERSECT SELECT unnest($3::text[]))) DESC,
                (a.category_id = $2) DESC, a.published_at DESC
       LIMIT $4`,
      [article.id, article.categoryId, article.tags, limit],
    );
    return rows;
  },

  async latest(db: Queryable, limit = 4): Promise<KbArticleSummary[]> {
    const { rows } = await db.query<KbArticleSummary>(
      `SELECT ${SUMMARY_COLS} ${FROM} ORDER BY a.published_at DESC LIMIT $1`,
      [limit],
    );
    return rows;
  },
};
