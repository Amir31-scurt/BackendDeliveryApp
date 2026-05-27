const { pool } = require('./db.js');
pool.query("SELECT pg_get_functiondef(oid), pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'compute_order_from_total'").then(res => { console.log(res.rows); process.exit(0); });
