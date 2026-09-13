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
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { createClient } = require('@supabase/supabase-js');

// ---- CONFIG (env vars override these) ----------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://omhzghowyluojwnlmrqp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9taHpoZ293eWxvandrbmxtcnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU0Nzk1OTYsImV4cCI6MjA1MTA1NTU5Nn0.09iaLH4V7PWLjk0hGVx7PjjMZ_gjRNxYuIAfSevjTms';
const BUCKETS = (process.env.SUPABASE_BUCKETS || 'profile-pictures,restaurant-images')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);
const DEST_DIR = process.env.DEST_DIR || '/repositories/BackendDeliveryApp/public/uploads';
// -------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Recursively list every file in a bucket. Supabase's list() caps each call
// at 1000 results, so we page through with offset until a page comes back
// short of the limit (meaning there's nothing left).
async function listAllFiles(bucketName, prefix = '') {
  const PAGE_SIZE = 1000;
  let allEntries = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucketName).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;

    allEntries = allEntries.concat(data);
    if (data.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
  }

  let files = [];
  for (const item of allEntries) {
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function publicUrlFor(bucketName, relPath) {
  // Bucket is public, so we can hit the public storage URL directly and
  // stream the response — this avoids ever holding the whole file in memory.
  const encodedPath = relPath.split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${encodedPath}`;
}

async function downloadAndSave(bucketName, relPath) {
  const destPath = path.join(DEST_DIR, bucketName, relPath);
  const url = publicUrlFor(bucketName, relPath);

  // Cheap size check first (HEAD, no body) — skip already-migrated files
  // without downloading anything at all.
  if (fs.existsSync(destPath)) {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      const remoteSize = Number(head.headers.get('content-length'));
      if (remoteSize && fs.statSync(destPath).size === remoteSize) {
        console.log(`SKIP (already present, same size): ${bucketName}/${relPath}`);
        return;
      }
    } catch {
      // HEAD failed — fall through and just re-download
    }
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  const tmpPath = `${destPath}.part`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    console.error(`FAILED to download ${bucketName}/${relPath}: HTTP ${response.status}`);
    return;
  }

  try {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmpPath));
    fs.renameSync(tmpPath, destPath); // atomic-ish: only replace once fully written
    console.log(`SAVED: ${bucketName}/${relPath} -> ${destPath}`);
  } catch (err) {
    console.error(`FAILED to write ${bucketName}/${relPath}:`, err.message);
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
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
      await sleep(150); // small pause between files — easier on this host's memory limits
    }
  }

  console.log('\nDone. Every file kept its original Supabase name and path.');
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});