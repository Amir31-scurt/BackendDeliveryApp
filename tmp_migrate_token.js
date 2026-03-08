import pg from 'pg';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });

const pool = new pg.Pool({
  host: process.env.HOST,
  port: Number(process.env.PORT || 5432),
  database: process.env.DB,
  user: process.env.USER,
  password: String(process.env.PASSWORD),
  ssl: process.env.SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  try {
    console.log('Altering delivery_token column in orders table...');
    await pool.query('ALTER TABLE orders ALTER COLUMN delivery_token TYPE VARCHAR(255)');
    console.log('Successfully altered column type!');
  } catch (err) {
    console.error('Error altering column:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
