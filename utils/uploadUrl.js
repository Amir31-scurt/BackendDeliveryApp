const path = require("path");

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

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/jpg", "image/pjpeg"];
const ALLOWED_IMAGE_EXTS = /\.(jpe?g|png)$/i;

/**
 * Multer file filter to accept only standard image formats (JPEG, JPG, PNG).
 */
function imageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  const isExtValid = ALLOWED_IMAGE_EXTS.test(ext);
  const isMimeValid = ALLOWED_IMAGE_MIMES.includes(mime);

  if (isExtValid || isMimeValid) {
    cb(null, true);
  } else {
    req.fileValidationError = "Format d'image non supporté. Veuillez utiliser un format classique (JPG, JPEG, PNG).";
    cb(null, false);
  }
}

module.exports = {
  buildUploadUrl,
  imageFileFilter,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_IMAGE_EXTS,
};
