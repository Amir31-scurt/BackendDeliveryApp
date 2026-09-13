/**
 * One-time fix: rewrite old Supabase Storage image URLs stored in Postgres
 * to point at the new local /uploads path instead.
 *
 * Old:  https://omhzhgowylojwknlmrqp.supabase.co/storage/v1/object/public/<bucket>/<filename>
 * New:  https://gourmetdamour.com/uploads/<bucket>/<filename>
 *
 * Only the domain+path prefix changes — bucket name and filename are left
 * byte-for-byte identical, matching exactly what the migration script saved
 * to disk. NULL / non-Supabase values are left untouched.
 *
 * Run from inside your backend project (so it can reuse ./db.js's pool):
 *
 *   DRY_RUN mode (default — no changes made, just shows what would happen):
 *     node fix-image-urls.js
 *
 *   Actually apply the changes:
 *     APPLY=true node fix-image-urls.js
 */

const { pool } = require('./db.js');

const OLD_PREFIX = 'https://omhzhgowylojwknlmrqp.supabase.co/storage/v1/object/public/';
const NEW_PREFIX = `${process.env.PUBLIC_BASE_URL || 'https://gourmetdamour.com'}/uploads/`;
const APPLY = process.env.APPLY === 'true';

const TARGETS = [
  { table: 'restaurants', column: 'image_url' },
  { table: 'menu_items', column: 'image_url' },
  { table: 'users', column: 'profile_picture' },
];

async function processTarget({ table, column }) {
  const { rows } = await pool.query(
    `SELECT id, ${column} AS old_url FROM ${table} WHERE ${column} LIKE $1`,
    [`${OLD_PREFIX}%`]
  );

  console.log(`\n${table}.${column}: ${rows.length} row(s) to update`);

  if (rows.length === 0) return { table, column, count: 0 };

  // Show a few examples either way
  for (const row of rows.slice(0, 5)) {
    const newUrl = row.old_url.replace(OLD_PREFIX, NEW_PREFIX);
    console.log(`  ${row.id}\n    old: ${row.old_url}\n    new: ${newUrl}`);
  }
  if (rows.length > 5) console.log(`  ... and ${rows.length - 5} more`);

  if (APPLY) {
    const result = await pool.query(
      `UPDATE ${table} SET ${column} = replace(${column}, $1, $2) WHERE ${column} LIKE $3`,
      [OLD_PREFIX, NEW_PREFIX, `${OLD_PREFIX}%`]
    );
    console.log(`  APPLIED: ${result.rowCount} row(s) updated in ${table}.${column}`);
  }

  return { table, column, count: rows.length };
}

(async () => {
  console.log(APPLY ? '*** APPLY MODE — changes WILL be written ***' : 'DRY RUN — no changes will be made (set APPLY=true to write)');
  console.log(`Replacing prefix:\n  ${OLD_PREFIX}\nwith:\n  ${NEW_PREFIX}`);

  let total = 0;
  for (const target of TARGETS) {
    const { count } = await processTarget(target);
    total += count;
  }

  console.log(`\nTotal rows ${APPLY ? 'updated' : 'that would be updated'}: ${total}`);
  if (!APPLY) console.log('Nothing was changed. Re-run with APPLY=true node fix-image-urls.js to apply.');

  await pool.end();
})().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
