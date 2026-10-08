import type { Queryable } from '../db/pool.js';

export const settingsRepository = {
  async all(db: Queryable): Promise<Record<string, unknown>> {
    const { rows } = await db.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM system_settings`,
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },

  async upsert(db: Queryable, key: string, value: unknown, userId: string | null): Promise<void> {
    await db.query(
      `INSERT INTO system_settings (key, value, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, JSON.stringify(value), userId],
    );
  },
};
