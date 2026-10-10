// Koneksi PostgreSQL (pg Pool) + helper query & transaksi.
import pg from 'pg';
import { env } from './env.js';

// Kembalikan kolom bigint/count sebagai number agar JSON-nya rapi
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

pool.on('error', (err) => console.error('[db] idle client error', err));

export const query = (text, params) => pool.query(text, params);

/** Jalankan beberapa query dalam satu transaksi. fn menerima client. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
