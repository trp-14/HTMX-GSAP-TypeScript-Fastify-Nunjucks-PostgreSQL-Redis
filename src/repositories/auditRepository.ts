import type { Queryable } from '../db/pool.js';
import { offsetFor, toPage, type Page } from '../utils/pagination.js';

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: unknown;
  newState?: unknown;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

export type AuditRecord = {
  id: number;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
};

export type AuditFilters = {
  q?: string;
  actorId?: string;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
  entityId?: string;
};

export const auditRepository = {
  async insert(db: Queryable, e: AuditEntry): Promise<void> {
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, previous_state, new_state, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        e.actorId,
        e.action,
        e.entityType,
        e.entityId,
        e.previousState === undefined ? null : JSON.stringify(e.previousState),
        e.newState === undefined ? null : JSON.stringify(e.newState),
        JSON.stringify(e.metadata ?? {}),
        e.ip ?? null,
      ],
    );
  },

  async list(db: Queryable, f: AuditFilters, page: number, pageSize: number): Promise<Page<AuditRecord>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: (n: number) => string, v: unknown) => {
      params.push(v);
      where.push(clause(params.length));
    };
    if (f.q)
      add(
        (n) =>
          `(a.entity_id ILIKE $${n} OR a.action ILIKE $${n} OR a.metadata::text ILIKE $${n} OR u.full_name ILIKE $${n})`,
        `%${f.q.replace(/[%_\\]/g, '\\$&')}%`,
      );
    if (f.actorId) add((n) => `a.actor_id = $${n}`, f.actorId);
    if (f.entityType) add((n) => `a.entity_type = $${n}`, f.entityType);
    if (f.entityId) add((n) => `a.entity_id = $${n}`, f.entityId);
    if (f.action) add((n) => `a.action = $${n}`, f.action);
    if (f.from) add((n) => `a.created_at >= $${n}::date`, f.from);
    if (f.to) add((n) => `a.created_at < ($${n}::date + 1)`, f.to);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ${whereSql}`;
    const total = (await db.query<{ n: number }>(`SELECT count(*)::int AS n ${from}`, params)).rows[0]!.n;
    const { rows } = await db.query<AuditRecord>(
      `SELECT a.id, a.actor_id AS "actorId", u.full_name AS "actorName", a.action, a.entity_type AS "entityType",
              a.entity_id AS "entityId", a.previous_state AS "previousState", a.new_state AS "newState", a.metadata,
              host(a.ip_address) AS "ipAddress", a.created_at AS "createdAt"
       ${from} ORDER BY a.created_at DESC, a.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offsetFor(page, pageSize)],
    );
    return toPage(rows, total, page, pageSize);
  },

  async distinctActions(db: Queryable): Promise<string[]> {
    const { rows } = await db.query<{ action: string }>(
      `SELECT DISTINCT action FROM audit_logs ORDER BY action`,
    );
    return rows.map((r) => r.action);
  },

  async distinctEntityTypes(db: Queryable): Promise<string[]> {
    const { rows } = await db.query<{ t: string }>(
      `SELECT DISTINCT entity_type AS t FROM audit_logs ORDER BY t`,
    );
    return rows.map((r) => r.t);
  },
};
