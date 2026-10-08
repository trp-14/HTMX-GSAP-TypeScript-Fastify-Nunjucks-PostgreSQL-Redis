import type { Queryable } from '../db/pool.js';
import { offsetFor, toPage, type Page } from '../utils/pagination.js';

export type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export type NotificationRecord = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

const COLS = `id, user_id AS "userId", type, title, body, link, entity_type AS "entityType", entity_id AS "entityId",
              read_at AS "readAt", created_at AS "createdAt"`;

export const notificationRepository = {
  async insert(db: Queryable, n: NotificationInput): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, title, body, link, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [n.userId, n.type, n.title, n.body ?? '', n.link ?? null, n.entityType ?? null, n.entityId ?? null],
    );
    return rows[0]!.id;
  },

  async list(
    db: Queryable,
    userId: string,
    f: { unreadOnly?: boolean },
    page: number,
    pageSize: number,
  ): Promise<Page<NotificationRecord>> {
    const filter = f.unreadOnly ? 'AND read_at IS NULL' : '';
    const total = (
      await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 ${filter}`,
        [userId],
      )
    ).rows[0]!.n;
    const { rows } = await db.query<NotificationRecord>(
      `SELECT ${COLS} FROM notifications WHERE user_id = $1 ${filter} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, pageSize, offsetFor(page, pageSize)],
    );
    return toPage(rows, total, page, pageSize);
  },

  async findForUser(db: Queryable, id: string, userId: string): Promise<NotificationRecord | null> {
    const { rows } = await db.query<NotificationRecord>(
      `SELECT ${COLS} FROM notifications WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  },

  async unreadCount(db: Queryable, userId: string): Promise<number> {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return rows[0]!.n;
  },

  /** The `user_id` predicate is the authorization check: users can only touch their own notifications. */
  async markRead(db: Queryable, id: string, userId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },

  async markAllRead(db: Queryable, userId: string): Promise<number> {
    const { rowCount } = await db.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return rowCount ?? 0;
  },

  async delete(db: Queryable, id: string, userId: string): Promise<boolean> {
    const { rowCount } = await db.query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ]);
    return (rowCount ?? 0) > 0;
  },
};
