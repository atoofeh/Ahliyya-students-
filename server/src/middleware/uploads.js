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
 * Virus scanning seam. Returns { clean, threat }.
 * Out of the box performs heuristic checks (embedded executables / scripts in
 * uploads). Replace or extend with a real engine (ClamAV daemon, cloud API).
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
 * kind: 'documents' | 'images'
 */
const persistUpload = async (file, kind) => {
  const allowed = kind === 'images'
    ? UPLOAD.ALLOWED_IMAGE_TYPES
    : [...UPLOAD.ALLOWED_DOC_TYPES, ...UPLOAD.ALLOWED_IMAGE_TYPES];

  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowed.includes(ext)) {
    throw ApiError.badRequest(`File type ${ext || '(none)'} is not allowed`, 'BAD_FILE_TYPE');
  }
  if (!checkMagicBytes(file.buffer, ext)) {
    throw ApiError.badRequest('File content does not match its extension', 'BAD_FILE_CONTENT');
  }
  const scan = await scanBuffer(file.buffer, file.originalname || '');
  if (!scan.clean) {
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
