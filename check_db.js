import 'dotenv/config';
import { pool } from './db.js';

async function check() {
  try {
    const res = await pool.query(`SELECT pg_get_functiondef(oid) as def, pg_get_function_arguments(oid) as args FROM pg_proc WHERE proname = 'compute_order_from_total'`);
    console.log("Functions found:", res.rowCount);
    console.log(JSON.stringify(res.rows, null, 2));
    
    // also check order id column type
    const res2 = await pool.query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'id'`);
    console.log("Order id type:", res2.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
