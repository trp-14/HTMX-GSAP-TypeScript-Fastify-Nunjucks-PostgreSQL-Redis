import type { Queryable } from '../db/pool.js';
import type { RequestStatus } from '../workflow/definition.js';
import { offsetFor, toPage, type Page } from '../utils/pagination.js';

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export type RequestRecord = {
  id: string;
  requestNumber: number;
  title: string;
  description: string;
  status: RequestStatus;
  priority: Priority;
  typeId: number;
  typeName: string;
  typeCode: string;
  requesterId: string;
  requesterName: string;
  departmentId: number;
  departmentName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  commentCount: number;
  attachmentCount: number;
};

export type RequestType = { id: number; code: string; name: string; description: string; slaDays: number };

export type RequestFilters = {
  q?: string;
  status?: RequestStatus;
  priority?: Priority;
  typeId?: number;
  departmentId?: number;
  assigneeId?: string;
  /** Restricts results to requests the user created or is assigned to. */
  visibleToUserId?: string;
  /** "mine" view: only requests created by this user. */
  requesterId?: string;
  overdue?: boolean;
};

export const REQUEST_SORTS = {
  created: 'r.created_at',
  updated: 'r.updated_at',
  number: 'r.request_number',
  due: 'r.due_date',
  priority: `array_position(ARRAY['LOW','MEDIUM','HIGH','URGENT']::text[], r.priority::text)`,
  status: `array_position(ARRAY['DRAFT','SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','PROCESSING','COMPLETED','REJECTED']::text[], r.status::text)`,
  title: 'lower(r.title)',
} as const;
export type RequestSort = keyof typeof REQUEST_SORTS;

const SELECT = `
  SELECT r.id, r.request_number AS "requestNumber", r.title, r.description, r.status, r.priority,
         r.request_type_id AS "typeId", t.name AS "typeName", t.code AS "typeCode",
         r.requester_id AS "requesterId", req.full_name AS "requesterName",
         r.department_id AS "departmentId", d.name AS "departmentName",
         r.assignee_id AS "assigneeId", asg.full_name AS "assigneeName",
         to_char(r.due_date, 'YYYY-MM-DD') AS "dueDate",
         r.submitted_at AS "submittedAt", r.decided_at AS "decidedAt", r.completed_at AS "completedAt",
         r.created_at AS "createdAt", r.updated_at AS "updatedAt",
         (SELECT count(*)::int FROM request_comments c WHERE c.request_id = r.id) AS "commentCount",
         (SELECT count(*)::int FROM request_attachments a WHERE a.request_id = r.id) AS "attachmentCount"
  FROM requests r
  JOIN request_types t ON t.id = r.request_type_id
  JOIN users req ON req.id = r.requester_id
  JOIN departments d ON d.id = r.department_id
  LEFT JOIN users asg ON asg.id = r.assignee_id`;

function buildWhere(f: RequestFilters): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: (n: number) => string, value: unknown) => {
    params.push(value);
    where.push(clause(params.length));
  };
  if (f.q) {
    const trimmed = f.q.trim();
    if (/^#?\d{3,7}$/.test(trimmed)) {
      add((n) => `r.request_number = $${n}`, Number(trimmed.replace('#', '')));
    } else {
      add(
        (n) => `(r.title ILIKE $${n} OR r.description ILIKE $${n} OR req.full_name ILIKE $${n})`,
        `%${trimmed.replace(/[%_\\]/g, '\\$&')}%`,
      );
    }
  }
  if (f.status) add((n) => `r.status = $${n}`, f.status);
  if (f.priority) add((n) => `r.priority = $${n}`, f.priority);
  if (f.typeId) add((n) => `r.request_type_id = $${n}`, f.typeId);
  if (f.departmentId) add((n) => `r.department_id = $${n}`, f.departmentId);
  if (f.assigneeId) add((n) => `r.assignee_id = $${n}`, f.assigneeId);
  if (f.requesterId) add((n) => `r.requester_id = $${n}`, f.requesterId);
  if (f.visibleToUserId) add((n) => `(r.requester_id = $${n} OR r.assignee_id = $${n})`, f.visibleToUserId);
  if (f.overdue) where.push(`r.due_date < current_date AND r.status NOT IN ('COMPLETED','REJECTED')`);
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export const requestRepository = {
  async list(
    db: Queryable,
    f: RequestFilters,
    sort: RequestSort,
    dir: 'asc' | 'desc',
    page: number,
    pageSize: number,
  ): Promise<Page<RequestRecord>> {
    const { sql, params } = buildWhere(f);
    const total = (
      await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM requests r JOIN users req ON req.id = r.requester_id ${sql}`,
        params,
      )
    ).rows[0]!.n;
    const order = `${REQUEST_SORTS[sort]} ${dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, r.request_number DESC`;
    const { rows } = await db.query<RequestRecord>(
      `${SELECT} ${sql} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offsetFor(page, pageSize)],
    );
    return toPage(rows, total, page, pageSize);
  },

  async findByNumber(db: Queryable, requestNumber: number): Promise<RequestRecord | null> {
    const { rows } = await db.query<RequestRecord>(`${SELECT} WHERE r.request_number = $1`, [requestNumber]);
    return rows[0] ?? null;
  },

  async findById(db: Queryable, id: string): Promise<RequestRecord | null> {
    const { rows } = await db.query<RequestRecord>(`${SELECT} WHERE r.id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Row-locks the request for the rest of the transaction, serialising concurrent transitions. */
  async lockById(db: Queryable, id: string): Promise<void> {
    await db.query(`SELECT 1 FROM requests WHERE id = $1 FOR UPDATE`, [id]);
  },

  async insert(
    db: Queryable,
    r: {
      title: string;
      description: string;
      typeId: number;
      requesterId: string;
      departmentId: number;
      priority: Priority;
      dueDate: string | null;
    },
  ): Promise<{ id: string; requestNumber: number }> {
    const { rows } = await db.query(
      `INSERT INTO requests (title, description, request_type_id, requester_id, department_id, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, request_number AS "requestNumber"`,
      [r.title, r.description, r.typeId, r.requesterId, r.departmentId, r.priority, r.dueDate],
    );
    return rows[0];
  },

  async updateDetails(
    db: Queryable,
    id: string,
    r: { title: string; description: string; typeId: number; priority: Priority; dueDate: string | null },
  ): Promise<void> {
    await db.query(
      `UPDATE requests SET title = $2, description = $3, request_type_id = $4, priority = $5, due_date = $6,
              updated_at = now() WHERE id = $1`,
      [id, r.title, r.description, r.typeId, r.priority, r.dueDate],
    );
  },

  async updateStatus(db: Queryable, id: string, to: RequestStatus): Promise<void> {
    await db.query(
      `UPDATE requests SET status = $2::text, updated_at = now(),
              submitted_at = CASE WHEN $2::text = 'SUBMITTED' THEN now() ELSE submitted_at END,
              decided_at   = CASE WHEN $2::text IN ('APPROVED','REJECTED','CHANGES_REQUESTED') THEN now() ELSE decided_at END,
              completed_at = CASE WHEN $2::text = 'COMPLETED' THEN now() ELSE completed_at END
       WHERE id = $1`,
      [id, to],
    );
  },

  async setAssignee(db: Queryable, id: string, assigneeId: string | null): Promise<void> {
    await db.query(`UPDATE requests SET assignee_id = $2, updated_at = now() WHERE id = $1`, [
      id,
      assigneeId,
    ]);
  },

  async touch(db: Queryable, id: string): Promise<void> {
    await db.query(`UPDATE requests SET updated_at = now() WHERE id = $1`, [id]);
  },

  async delete(db: Queryable, id: string): Promise<void> {
    await db.query(`DELETE FROM requests WHERE id = $1`, [id]);
  },

  async insertTransition(
    db: Queryable,
    t: {
      requestId: string;
      from: RequestStatus | null;
      to: RequestStatus;
      actorId: string;
      note: string | null;
    },
  ): Promise<void> {
    await db.query(
      `INSERT INTO workflow_transitions (request_id, from_status, to_status, actor_id, note) VALUES ($1, $2, $3, $4, $5)`,
      [t.requestId, t.from, t.to, t.actorId, t.note],
    );
  },

  async insertApproval(
    db: Queryable,
    a: {
      requestId: string;
      approverId: string;
      decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
      comment: string | null;
    },
  ): Promise<void> {
    await db.query(
      `INSERT INTO approvals (request_id, approver_id, decision, comment) VALUES ($1, $2, $3, $4)`,
      [a.requestId, a.approverId, a.decision, a.comment],
    );
  },

  async transitions(db: Queryable, requestId: string) {
    const { rows } = await db.query<{
      fromStatus: RequestStatus | null;
      toStatus: RequestStatus;
      actorName: string;
      note: string | null;
      createdAt: Date;
    }>(
      `SELECT w.from_status AS "fromStatus", w.to_status AS "toStatus", u.full_name AS "actorName", w.note,
              w.created_at AS "createdAt"
       FROM workflow_transitions w JOIN users u ON u.id = w.actor_id
       WHERE w.request_id = $1 ORDER BY w.created_at, w.id`,
      [requestId],
    );
    return rows;
  },

  async types(db: Queryable): Promise<RequestType[]> {
    const { rows } = await db.query<RequestType>(
      `SELECT id, code, name, description, sla_days AS "slaDays" FROM request_types ORDER BY name`,
    );
    return rows;
  },

  async typeById(db: Queryable, id: number): Promise<RequestType | null> {
    const { rows } = await db.query<RequestType>(
      `SELECT id, code, name, description, sla_days AS "slaDays" FROM request_types WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  // ---- comments ----

  async comments(db: Queryable, requestId: string) {
    const { rows } = await db.query<{
      id: string;
      body: string;
      authorId: string;
      authorName: string;
      authorTitle: string | null;
      createdAt: Date;
    }>(
      `SELECT c.id, c.body, c.author_id AS "authorId", u.full_name AS "authorName", u.job_title AS "authorTitle",
              c.created_at AS "createdAt"
       FROM request_comments c JOIN users u ON u.id = c.author_id
       WHERE c.request_id = $1 ORDER BY c.created_at`,
      [requestId],
    );
    return rows;
  },

  async insertComment(
    db: Queryable,
    c: { requestId: string; authorId: string; body: string },
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO request_comments (request_id, author_id, body) VALUES ($1, $2, $3) RETURNING id`,
      [c.requestId, c.authorId, c.body],
    );
    return rows[0]!.id;
  },

  /** Everyone who commented on a request — they are notified about new comments. */
  async commenterIds(db: Queryable, requestId: string): Promise<string[]> {
    const { rows } = await db.query<{ id: string }>(
      `SELECT DISTINCT author_id AS id FROM request_comments WHERE request_id = $1`,
      [requestId],
    );
    return rows.map((r) => r.id);
  },
};
