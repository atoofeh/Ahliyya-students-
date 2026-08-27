const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const ApiError = require('../core/ApiError');
const { UPLOAD } = require('../config/constants');

/**
 * Secure upload handling.
 *  - Files land under STORAGE_ROOT (never inside a publicly served directory).
 *  - Filenames are replaced with UUIDs; the original name is kept as metadata.
 *  - Extension AND magic-byte checks; dangerous types rejected.
 *  - Size limits are enforced by multer and configurable via settings.
 *  - scanBuffer() is the virus-scanning seam: wire ClamAV or a cloud scanner
 *    there without touching call sites.
 */

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const STORAGE = {
  root: env.STORAGE_ROOT,
  videos: path.join(env.STORAGE_ROOT, 'videos'),
  documents: path.join(env.STORAGE_ROOT, 'documents'),
  images: path.join(env.STORAGE_ROOT, 'images'),
  tmp: path.join(env.STORAGE_ROOT, 'tmp'),
};
Object.values(STORAGE).forEach(ensureDir);

const MAGIC_BYTES = [
  { ext: ['.pdf'], magic: [0x25, 0x50, 0x44, 0x46] },
  { ext: ['.png'], magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: ['.jpg', '.jpeg'], magic: [0xff, 0xd8, 0xff] },
  { ext: ['.gif'], magic: [0x47, 0x49, 0x46] },
  { ext: ['.zip', '.docx', '.pptx', '.xlsx'], magic: [0x50, 0x4b] },
  { ext: ['.webp'], magic: [0x52, 0x49, 0x46, 0x46] },
];

const checkMagicBytes = (buffer, ext) => {
  const rule = MAGIC_BYTES.find((r) => r.ext.includes(ext));
  if (!rule) return true; // No rule for this type (e.g. .txt, videos handled separately)
  return rule.magic.every((b, i) => buffer[i] === b);
};

/**
 * Malware check. Always runs a heuristic pass (executable headers / script
 * extensions). When CLAMAV_HOST is configured the buffer is also streamed to
 * clamd; a daemon that cannot be reached FAILS CLOSED (threat 'scanner_unavailable').
 * The heuristic alone is not antivirus — see docs/SECURITY.md.
 */
const scanBuffer = async (buffer, originalName) => {
  const head = buffer.subarray(0, 2);
  if (head[0] === 0x4d && head[1] === 0x5a) {
    return { clean: false, threat: 'Windows executable (MZ header)' };
  }
  if (buffer.subarray(0, 4).toString('latin1') === '\x7fELF') {
    return { clean: false, threat: 'ELF executable' };
  }
  const lowered = originalName.toLowerCase();
  if (/\.(exe|bat|cmd|sh|ps1|msi|scr|vbs|js|jar|com)(\.|$)/.test(lowered)) {
    return { clean: false, threat: 'Executable file type' };
  }

  if (env.CLAMAV_HOST) {
    try {
      const { scanWithClamd } = require('../core/clamav');
      return await scanWithClamd(buffer, { host: env.CLAMAV_HOST, port: env.CLAMAV_PORT, timeoutMs: env.CLAMAV_TIMEOUT_MS });
    } catch (err) {
      require('../config/logger').logger.error(`ClamAV unavailable: ${err.message}`);
      return { clean: false, threat: 'scanner_unavailable' };
    }
  }
  return { clean: true, threat: null };
};

const memoryUpload = (maxMb) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 5 },
  });

/** Document/image upload middleware with validation + persistence helper. */
const documentUpload = memoryUpload(200).single('file');
const imageUpload = memoryUpload(10).single('file');
const chunkUpload = memoryUpload(env.CHUNK_SIZE_MB * 4).single('chunk');

/**
 * Validates an uploaded buffer and writes it to disk with a UUID filename.
 * kind: 'documents' | 'images'. SVG (script-bearing) is only accepted where
 * the caller opts in (course thumbnails) and is never served inline.
 */
const persistUpload = async (file, kind, { allowSvg = false } = {}) => {
  const allowed = kind === 'images'
    ? UPLOAD.ALLOWED_IMAGE_TYPES
    : [...UPLOAD.ALLOWED_DOC_TYPES, ...UPLOAD.ALLOWED_IMAGE_TYPES];

  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowed.includes(ext) || (ext === '.svg' && !allowSvg)) {
    throw ApiError.badRequest(`File type ${ext || '(none)'} is not allowed here`, 'BAD_FILE_TYPE');
  }
  const mimes = UPLOAD.ALLOWED_MIME[ext] || [];
  if (!mimes.includes(String(file.mimetype || '').toLowerCase())) {
    throw ApiError.badRequest(`Declared type ${file.mimetype || '(none)'} does not match ${ext}`, 'BAD_FILE_TYPE');
  }
  if (!checkMagicBytes(file.buffer, ext)) {
    throw ApiError.badRequest('File content does not match its extension', 'BAD_FILE_CONTENT');
  }
  const scan = await scanBuffer(file.buffer, file.originalname || '');
  if (!scan.clean) {
    if (scan.threat === 'scanner_unavailable') {
      throw new ApiError(503, 'Upload scanning is temporarily unavailable. Try again later.', 'SCANNER_UNAVAILABLE');
    }
    throw ApiError.badRequest(`Upload rejected: ${scan.threat}`, 'MALWARE_SUSPECTED');
  }

  const storedName = `${uuidv4()}${ext}`;
  const dir = STORAGE[kind] || STORAGE.documents;
  const fullPath = path.join(dir, storedName);
  await fs.promises.writeFile(fullPath, file.buffer);

  return {
    storedName,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
    path: fullPath,
    kind,
  };
};

module.exports = { STORAGE, documentUpload, imageUpload, chunkUpload, persistUpload, scanBuffer, checkMagicBytes };
