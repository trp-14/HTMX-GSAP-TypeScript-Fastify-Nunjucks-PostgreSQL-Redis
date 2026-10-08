import { loadDotEnv } from '../../utils/env.js';
import { createPool } from '../pool.js';
import { migrate, resetDatabase } from '../migrator.js';

loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const pool = createPool(url);

try {
  if (process.argv.includes('--reset')) {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database');
    await resetDatabase(pool);
    console.log('database reset');
  }
  const applied = await migrate(pool, (m) => console.log(m));
  console.log(applied.length ? `${applied.length} migration(s) applied` : 'database is up to date');
} finally {
  await pool.end();
}
