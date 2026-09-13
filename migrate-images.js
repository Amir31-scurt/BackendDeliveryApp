/**
 * Run this ON THE SERVER, from cPanel's browser Terminal, in the same
 * place you already run PM2 (e.g. inside /repositories/BackendDeliveryApp).
 *
 * It downloads every file from a PUBLIC Supabase Storage bucket and writes
 * it straight into your local public/ folder, preserving the exact
 * filename and folder structure Supabase has. No renaming anywhere.
 *
 * Install (once, on the server):
 *   npm install @supabase/supabase-js
 *
 * Run (comma-separate multiple buckets):
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_KEY=your-anon-key \
 *   SUPABASE_BUCKETS=profile-pictures,restaurant-images \
 *   DEST_DIR=/repositories/BackendDeliveryApp/public \
 *   node migrate-images.js
 *
 * Each bucket is saved into its own subfolder under DEST_DIR, e.g.:
 *   public/profile-pictures/<same path Supabase had>
 *   public/restaurant-images/<same path Supabase had>
 * This mirrors Supabase's own /storage/v1/object/public/<bucket>/<path>
 * structure, so filenames never change.
 *
 * Or just hardcode the CONFIG values below and run: node migrate-images.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ---- CONFIG (env vars override these) ----------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || 'PASTE_YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'PASTE_YOUR_SUPABASE_ANON_KEY';
const BUCKETS = (process.env.SUPABASE_BUCKETS || 'profile-pictures,restaurant-images')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);
const DEST_DIR = process.env.DEST_DIR || '/repositories/BackendDeliveryApp/public/uploads';
// -------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Recursively list every file in a bucket (list() only returns one level at a time)
async function listAllFiles(bucketName, prefix = '') {
  const { data, error } = await supabase.storage.from(bucketName).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw error;

  let files = [];
  for (const item of data) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
    // Folders come back with no metadata / null id
    if (item.id === null && !item.metadata) {
      const nested = await listAllFiles(bucketName, itemPath);
      files = files.concat(nested);
    } else {
      files.push(itemPath);
    }
  }
  return files;
}

async function downloadAndSave(bucketName, relPath) {
  const destPath = path.join(DEST_DIR, bucketName, relPath);

  const { data: blob, error } = await supabase.storage.from(bucketName).download(relPath);
  if (error) {
    console.error(`FAILED to download ${bucketName}/${relPath}:`, error.message);
    return;
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  // Skip if already there with the same size — makes re-runs safe/fast
  if (fs.existsSync(destPath) && fs.statSync(destPath).size === buffer.length) {
    console.log(`SKIP (already present, same size): ${bucketName}/${relPath}`);
    return;
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
  console.log(`SAVED: ${bucketName}/${relPath} -> ${destPath}`);
}

(async () => {
  if (SUPABASE_URL.startsWith('PASTE_') || SUPABASE_KEY.startsWith('PASTE_')) {
    console.error('Fill in SUPABASE_URL and SUPABASE_KEY (env vars or CONFIG block) before running.');
    process.exit(1);
  }

  for (const bucketName of BUCKETS) {
    console.log(`\nListing files in bucket "${bucketName}"...`);
    const files = await listAllFiles(bucketName);
    console.log(`Found ${files.length} files. Writing into ${path.join(DEST_DIR, bucketName)}`);

    for (const f of files) {
      await downloadAndSave(bucketName, f);
    }
  }

  console.log('\nDone. Every file kept its original Supabase name and path.');
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
