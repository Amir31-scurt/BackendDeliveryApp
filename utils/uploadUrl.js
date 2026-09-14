/**
 * Build a fully-qualified public URL for a locally-uploaded file.
 *
 * Uses PUBLIC_BASE_URL env var (e.g. https://gourmetdamour.com).
 * Falls back to http://localhost:4000 in development so nothing is empty.
 *
 * @param {string} subfolder - e.g. "restaurants" or "profiles"
 * @param {string} fileName  - the filename saved on disk
 * @returns {string}         - e.g. https://gourmetdamour.com/uploads/restaurants/foo.jpg
 */
function buildUploadUrl(subfolder, fileName) {
  const base = (process.env.PUBLIC_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  return `${base}/uploads/${subfolder}/${fileName}`;
}

module.exports = { buildUploadUrl };
