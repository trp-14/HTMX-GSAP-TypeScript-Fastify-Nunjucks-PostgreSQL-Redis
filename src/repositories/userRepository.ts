import type { Queryable } from '../db/pool.js';
import type { Role } from '../auth/permissions.js';
import { offsetFor, toPage, type Page } from '../utils/pagination.js';

export type UserRecord = {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  isActive: boolean;
  roles: Role[];
  lastLoginAt: Date | null;
  createdAt: Date;
};

export type Department = { id: number; code: string; name: string };

const SELECT_USER = `
  SELECT u.id, u.email, u.full_name AS "fullName", u.job_title AS "jobTitle",
         u.department_id AS "departmentId", d.name AS "departmentName",
         u.is_active AS "isActive", u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt",
         COALESCE(array_agg(r.name ORDER BY r.id) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
  FROM users u
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON r.id = ur.role_id`;

export const userRepository = {
  async findById(db: Queryable, id: string): Promise<UserRecord | null> {
    const { rows } = await db.query<UserRecord>(`${SELECT_USER} WHERE u.id = $1 GROUP BY u.id, d.name`, [id]);
    return rows[0] ?? null;
  },

  async findCredentialsByEmail(
    db: Queryable,
    email: string,
  ): Promise<{ id: string; passwordHash: string; isActive: boolean } | null> {
    const { rows } = await db.query(
      `SELECT id, password_hash AS "passwordHash", is_active AS "isActive" FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );
    return rows[0] ?? null;
  },

  async passwordHash(db: Queryable, id: string): Promise<string | null> {
    const { rows } = await db.query<{ hash: string }>(
      `SELECT password_hash AS hash FROM users WHERE id = $1`,
      [id],
    );
    return rows[0]?.hash ?? null;
  },

  async emailExists(db: Queryable, email: string): Promise<boolean> {
    const { rowCount } = await db.query(`SELECT 1 FROM users WHERE email = $1`, [email.toLowerCase()]);
    return (rowCount ?? 0) > 0;
  },

  async list(
    db: Queryable,
    f: {
      q?: string;
      role?: Role;
      departmentId?: number;
      status?: 'active' | 'inactive';
      page: number;
      pageSize: number;
    },
  ): Promise<Page<UserRecord>> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.q) {
      params.push(`%${f.q.toLowerCase()}%`);
      where.push(
        `(lower(u.full_name) LIKE $${params.length} OR u.email LIKE $${params.length} OR lower(coalesce(u.job_title,'')) LIKE $${params.length})`,
      );
    }
    if (f.role) {
      params.push(f.role);
      where.push(
        `EXISTS (SELECT 1 FROM user_roles x JOIN roles y ON y.id = x.role_id WHERE x.user_id = u.id AND y.name = $${params.length})`,
      );
    }
    if (f.departmentId) {
      params.push(f.departmentId);
      where.push(`u.department_id = $${params.length}`);
    }
    if (f.status) where.push(f.status === 'active' ? 'u.is_active' : 'NOT u.is_active');
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users u ${whereSql}`, params)
    ).rows[0]!.n;
    params.push(f.pageSize, offsetFor(f.page, f.pageSize));
    const { rows } = await db.query<UserRecord>(
      `${SELECT_USER} ${whereSql} GROUP BY u.id, d.name ORDER BY u.full_name LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return toPage(rows, total, f.page, f.pageSize);
  },

  async insert(
    db: Queryable,
    u: {
      email: string;
      fullName: string;
      jobTitle: string | null;
      departmentId: number | null;
      passwordHash: string;
    },
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (email, full_name, job_title, department_id, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [u.email.toLowerCase(), u.fullName, u.jobTitle, u.departmentId, u.passwordHash],
    );
    return rows[0]!.id;
  },

  async setRoles(db: Queryable, userId: string, roles: readonly Role[]): Promise<void> {
    await db.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    if (roles.length) {
      await db.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = ANY($2::text[])`,
        [userId, roles],
      );
    }
  },

  async updateProfile(
    db: Queryable,
    id: string,
    p: { fullName: string; jobTitle: string | null; departmentId: number | null },
  ): Promise<void> {
    await db.query(
      `UPDATE users SET full_name = $2, job_title = $3, department_id = $4, updated_at = now() WHERE id = $1`,
      [id, p.fullName, p.jobTitle, p.departmentId],
    );
  },

  async setPassword(db: Queryable, id: string, passwordHash: string): Promise<void> {
    await db.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
      id,
      passwordHash,
    ]);
  },

  async setActive(db: Queryable, id: string, active: boolean): Promise<void> {
    await db.query(`UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1`, [id, active]);
  },

  async touchLogin(db: Queryable, id: string): Promise<void> {
    await db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [id]);
  },

  /** Active users holding any of the given roles — used to route notifications. */
  async idsWithRoles(db: Queryable, roles: readonly Role[]): Promise<string[]> {
    const { rows } = await db.query<{ id: string }>(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
       WHERE u.is_active AND r.name = ANY($1::text[])`,
      [roles],
    );
    return rows.map((r) => r.id);
  },

  /** Users a request can be assigned to (operations staff and managers). */
  async assignable(db: Queryable): Promise<{ id: string; fullName: string; jobTitle: string | null }[]> {
    const { rows } = await db.query(
      `SELECT DISTINCT u.id, u.full_name AS "fullName", u.job_title AS "jobTitle"
       FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
       WHERE u.is_active AND r.name IN ('OPERATIONS', 'MANAGER') ORDER BY "fullName"`,
    );
    return rows;
  },

  async departments(db: Queryable): Promise<Department[]> {
    const { rows } = await db.query<Department>(`SELECT id, code, name FROM departments ORDER BY name`);
    return rows;
  },

  async counts(db: Queryable): Promise<{ total: number; active: number }> {
    const { rows } = await db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE is_active)::int AS active FROM users`,
    );
    return rows[0];
  },
};
