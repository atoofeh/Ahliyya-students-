/**
 * Import past-question papers from a folder: `node src/scripts/import-past-papers.js <dir>`
 *
 * For papers too large or too many to add one at a time from the browser.
 * Every file goes through FileService.upload — the same extension, declared
 * type, magic-byte and antivirus checks as an upload from the Past questions
 * page — so nothing arrives by a side door.
 *
 * Safe to run repeatedly: a paper already in the library with the same file
 * name and size is skipped, never duplicated. Nothing is ever deleted.
 *
 * Titles come from the file name. Stray replacement characters and bidi
 * controls, which Arabic file names pick up when copied between systems, are
 * stripped so the library shows a clean title.
 */
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../config/db');
const { logger } = require('../config/logger');

const SUBJECTS = [
  [/انجليزي|إنجليزي|english/i, 'اللغة الإنجليزية'],
  [/حاسوب|computer/i, 'الحاسوب'],
  [/عربي|arabic/i, 'اللغة العربية'],
];

const cleanTitle = (file) => path.basename(file, path.extname(file))
  // U+FFFD, bidi marks/embeddings/isolates, zero-width characters
  .replace(/[\uFFFD\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** Returns what happened to each file, so callers and tests can see it. */
const run = async (dir) => {
  const report = [];
  const User = require('../models/User');
  const FileAsset = require('../models/FileAsset');
  const FileService = require('../modules/files/files.service');

  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Not a folder: ${dir || '(none given)'}`);
  }
  // Recorded as uploaded by the owner: the import acts for the institution.
  const owner = await User.findOne({ role: 'super_admin', deletedAt: null }).select('_id');
  if (!owner) throw new Error('No owner account to record the import against');

  const files = fs.readdirSync(dir).filter((f) => path.extname(f).toLowerCase() === '.pdf');
  if (!files.length) { logger.info(`No PDFs in ${dir}`); return report; }

  for (const name of files) {
    const full = path.join(dir, name);
    const title = cleanTitle(name);
    const size = fs.statSync(full).size;
    const originalname = `${title}.pdf`;

    const existing = await FileAsset.findOne({ scope: 'past_paper', deletedAt: null, originalName: originalname, sizeBytes: size });
    if (existing) { logger.info(`skip (already imported): ${title}`); report.push({ title, status: 'skipped' }); continue; }

    const buffer = fs.readFileSync(full);
    const subject = (SUBJECTS.find(([re]) => re.test(title)) || [null, ''])[1];
    const asset = await FileService.upload(
      { originalname, mimetype: 'application/pdf', buffer, size },
      { uploadedBy: owner._id, kind: 'documents', scope: 'past_paper', title, subject },
      'import-script'
    );
    logger.info(`imported: ${title} (${(size / 1048576).toFixed(1)} MB) → ${asset._id}`);
    report.push({ title, subject, status: 'imported', id: String(asset._id) });
  }
  return report;
};

module.exports = { run, cleanTitle };

// Run only when invoked directly, so the test suite can call run() itself.
if (require.main === module) {
  connectDB()
    .then(() => run(process.argv[2]))
    .then(async () => { logger.info('Past-paper import complete'); await disconnectDB(); process.exit(0); })
    .catch(async (err) => { logger.error(`Past-paper import failed: ${err.message}`); await disconnectDB().catch(() => {}); process.exit(1); });
}
