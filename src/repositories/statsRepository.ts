import type { Queryable } from '../db/pool.js';
import type { RequestStatus } from '../workflow/definition.js';

export type RequestCounters = {
  active: number;
  pendingApprovals: number;
  submittedToday: number;
  approvedToday: number;
  processing: number;
  completed: number;
  completedToday: number;
  overdue: number;
  drafts: number;
};

export type ActivityItem = {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export const statsRepository = {
  async requestCounters(db: Queryable, visibleToUserId?: string): Promise<RequestCounters> {
    const scope = visibleToUserId ? `AND (r.requester_id = $1 OR r.assignee_id = $1)` : '';
    const params = visibleToUserId ? [visibleToUserId] : [];
    const { rows } = await db.query<RequestCounters>(
      `SELECT
         count(*) FILTER (WHERE status IN ('SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','PROCESSING'))::int AS active,
         count(*) FILTER (WHERE status IN ('SUBMITTED','UNDER_REVIEW'))::int AS "pendingApprovals",
         count(*) FILTER (WHERE submitted_at >= date_trunc('day', now()))::int AS "submittedToday",
         (SELECT count(*)::int FROM approvals ap JOIN requests r2 ON r2.id = ap.request_id
           WHERE ap.decision = 'APPROVED' AND ap.created_at >= date_trunc('day', now())
           ${visibleToUserId ? 'AND (r2.requester_id = $1 OR r2.assignee_id = $1)' : ''}) AS "approvedToday",
         count(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
         count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
         count(*) FILTER (WHERE status = 'COMPLETED' AND completed_at >= date_trunc('day', now()))::int AS "completedToday",
         count(*) FILTER (WHERE due_date < current_date AND status NOT IN ('COMPLETED','REJECTED','DRAFT'))::int AS overdue,
         count(*) FILTER (WHERE status = 'DRAFT')::int AS drafts
       FROM requests r WHERE true ${scope}`,
      params,
    );
    return rows[0]!;
  },

  async statusDistribution(db: Queryable, visibleToUserId?: string): Promise<Record<RequestStatus, number>> {
    const scope = visibleToUserId ? `WHERE requester_id = $1 OR assignee_id = $1` : '';
    const { rows } = await db.query<{ status: RequestStatus; n: number }>(
      `SELECT status, count(*)::int AS n FROM requests ${scope} GROUP BY status`,
      visibleToUserId ? [visibleToUserId] : [],
    );
    const out = {} as Record<RequestStatus, number>;
    for (const r of rows) out[r.status] = r.n;
    return out;
  },

  /** Requests created per day for the last N days (sparkline on the overview). */
  async dailyVolume(
    db: Queryable,
    days = 14,
  ): Promise<{ day: string; created: number; completed: number }[]> {
    const { rows } = await db.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day,
              (SELECT count(*)::int FROM requests WHERE created_at::date = d) AS created,
              (SELECT count(*)::int FROM requests WHERE completed_at::date = d) AS completed
       FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') AS g(d)`,
      [days],
    );
    return rows;
  },

  async recentActivity(db: Queryable, limit = 12, entityTypes?: string[]): Promise<ActivityItem[]> {
    const filter = entityTypes?.length ? `AND a.entity_type = ANY($2::text[])` : '';
    const { rows } = await db.query<ActivityItem>(
      `SELECT a.id, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId", u.full_name AS "actorName",
              a.metadata, a.created_at AS "createdAt"
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.action NOT IN ('USER_LOGGED_IN', 'USER_LOGGED_OUT') ${filter}
       ORDER BY a.created_at DESC, a.id DESC LIMIT $1`,
      entityTypes?.length ? [limit, entityTypes] : [limit],
    );
    return rows;
  },

  async activityAfter(
    db: Queryable,
    afterId: number,
    limit = 10,
    entityTypes?: string[],
  ): Promise<ActivityItem[]> {
    const filter = entityTypes?.length ? `AND a.entity_type = ANY($3::text[])` : '';
    const { rows } = await db.query<ActivityItem>(
      `SELECT a.id, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId", u.full_name AS "actorName",
              a.metadata, a.created_at AS "createdAt"
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.id > $1 AND a.action NOT IN ('USER_LOGGED_IN', 'USER_LOGGED_OUT') ${filter}
       ORDER BY a.id DESC LIMIT $2`,
      entityTypes?.length ? [afterId, limit, entityTypes] : [afterId, limit],
    );
    return rows;
  },

  async averageCycleHours(db: Queryable): Promise<number | null> {
    const { rows } = await db.query<{ h: number | null }>(
      `SELECT avg(extract(epoch FROM completed_at - submitted_at) / 3600)::float AS h
       FROM requests WHERE status = 'COMPLETED' AND submitted_at IS NOT NULL AND completed_at > now() - interval '60 days'`,
    );
    return rows[0]?.h ?? null;
  },
};
