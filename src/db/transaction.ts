import type pg from 'pg';

/**
 * Runs `work` inside a single PostgreSQL transaction. Rolls back on any thrown error.
 * Services use this whenever several persistent records must change atomically
 * (e.g. request status + workflow transition + audit log + notifications).
 */
export async function withTransaction<T>(pool: pg.Pool, work: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
