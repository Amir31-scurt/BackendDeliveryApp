require('dotenv').config();
const { pool } = require('./db.js');

async function run() {
  try {
    const res = await pool.query(`SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'notifications'`);
    console.log(res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
