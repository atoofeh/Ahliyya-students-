/**
 * Move the index to the front of videos that were stored before the upload
 * pipeline did it for them.
 *
 *   node src/scripts/repair-video-index.js                  # scan, change nothing
 *   node src/scripts/repair-video-index.js --repair         # repair every affected video
 *   node src/scripts/repair-video-index.js --repair --only 84fc6b 04b34d
 *   node src/scripts/repair-video-index.js --durations      # fill in missing durations only
 *
 * A player decodes nothing until it holds the MP4 index (`moov`). Phones and
 * screen recorders write it after the media, so the player must fetch the end
 * of the file before the first frame — on a long lecture over mobile data that
 * reads as "the video doesn't play". `#processUpload` now repackages new
 * uploads; this script does the same for what is already stored.
 *
 * Each repair decrypts to a temp file, repackages with `-c copy -movflags
 * +faststart` (no re-encode, no quality lost), probes the duration, re-encrypts
 * under a fresh key, checks the result reads back correctly, and only then
 * swaps it in — atomically, because a student may be streaming that file. The
 * previous encrypted file is kept in BACKUP_DIR, so every step can be undone.
 *
 * Needs ffmpeg/ffprobe on PATH; without them it scans and reports only.
 */
require('../config/env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const mongoose = require('mongoose');
const {
  unwrapKey, generateVideoKey, wrapKey, createEncryptStream, createDecryptStreamAtOffset,
} = require('../core/cryptoUtils');
const Video = require('../models/Video');

const execFileAsync = promisify(execFile);
const REPAIR = process.argv.includes('--repair');
const DURATIONS = process.argv.includes('--durations');
const ONLY = process.argv.includes('--only')
  ? process.argv.slice(process.argv.indexOf('--only') + 1).filter((a) => !a.startsWith('--'))
  : null;
const BACKUP_DIR = process.env.VIDEO_REPAIR_BACKUP_DIR || '/root/lms-backups/videos';

const decryptTo = (storagePath, key, iv, destination, length) => new Promise((resolve, reject) => {
  const { decipher } = createDecryptStreamAtOffset(key, iv, 0);
  const source = fs.createReadStream(storagePath, length ? { start: 0, end: length - 1 } : undefined);
  const out = fs.createWriteStream(destination);
  source.on('error', reject);
  decipher.on('error', reject);
  out.on('error', reject);
  out.on('finish', resolve);
  source.pipe(decipher).pipe(out);
});

/** The first few top-level box types, in file order. */
const boxOrder = (buf) => {
  const types = [];
  let offset = 0;
  while (offset + 8 <= buf.length && types.length < 5) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    if (!/^[a-z0-9]{4}$/i.test(type)) break;
    let header = 8;
    if (size === 1) {
      if (offset + 16 > buf.length) break;
      size = Number(buf.readBigUInt64BE(offset + 8));
      header = 16;
    }
    types.push(type);
    if (size < header) break;
    offset += size;
  }
  return types;
};

/** True when the media comes before the index, or the index is further in than we read. */
const indexIsLast = (types) => {
  const moov = types.indexOf('moov');
  const mdat = types.indexOf('mdat');
  if (moov === -1 && mdat !== -1) return true;
  if (moov !== -1 && mdat !== -1) return moov > mdat;
  return false;
};

const repairOne = async (video, short, tmpDir) => {
  const plain = path.join(tmpDir, `${short}.mp4`);
  const fixed = path.join(tmpDir, `${short}.fixed.mp4`);
  const reencrypted = path.join(tmpDir, `${short}.enc`);
  const verify = path.join(tmpDir, `${short}.verify`);
  const started = Date.now();
  try {
    const key = unwrapKey(video.encryption.wrappedKey, video.encryption.keyVersion || 1);
    const iv = Buffer.from(video.encryption.iv, 'hex');
    await decryptTo(video.storagePath, key, iv, plain);

    await execFileAsync('ffmpeg', [
      '-loglevel', 'error', '-i', plain, '-c', 'copy', '-movflags', '+faststart', '-y', fixed,
    ], { maxBuffer: 8 * 1024 * 1024 });

    const head = await fs.promises.readFile(fixed).then((b) => b.subarray(0, 65536));
    if (indexIsLast(boxOrder(head))) throw new Error('repackaging did not move the index');

    let duration = video.durationSeconds || 0;
    try {
      const { stdout } = await execFileAsync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', fixed]);
      duration = Math.round(parseFloat(JSON.parse(stdout).format?.duration || 0)) || duration;
    } catch { /* keep the duration we had */ }

    const fresh = generateVideoKey();
    await new Promise((resolve, reject) => {
      fs.createReadStream(fixed)
        .pipe(createEncryptStream(fresh.key, fresh.iv))
        .pipe(fs.createWriteStream(reencrypted))
        .on('finish', resolve)
        .on('error', reject);
    });

    // Read it back the way the stream route will, before anything is swapped.
    await decryptTo(reencrypted, fresh.key, fresh.iv, verify, 65536);
    if (indexIsLast(boxOrder(await fs.promises.readFile(verify)))) {
      throw new Error('the re-encrypted file does not read back with the index first');
    }

    const { size } = await fs.promises.stat(fixed);
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
    await fs.promises.copyFile(video.storagePath, path.join(BACKUP_DIR, `${short}-source.enc.bak`));

    // Swap atomically: a student may be streaming this very file.
    const staged = `${video.storagePath}.new`;
    await fs.promises.copyFile(reencrypted, staged);
    const dir = await fs.promises.stat(path.dirname(video.storagePath));
    await fs.promises.chown(staged, dir.uid, dir.gid).catch(() => {});
    await fs.promises.rename(staged, video.storagePath);

    const { wrapped, keyVersion } = wrapKey(fresh.key);
    await Video.updateOne({ _id: video._id }, {
      $set: {
        sizeBytes: size,
        durationSeconds: duration,
        encryption: { wrappedKey: wrapped, iv: fresh.iv.toString('hex'), algorithm: 'aes-256-ctr', keyVersion },
      },
    });
    console.log(`    repaired in ${Math.round((Date.now() - started) / 1000)}s — sizeBytes=${size} duration=${duration}`);
    console.log(`    backup: ${path.join(BACKUP_DIR, `${short}-source.enc.bak`)}`);
  } finally {
    for (const file of [plain, fixed, reencrypted, verify]) {
      await fs.promises.unlink(file).catch(() => {});
    }
  }
};

/**
 * Fill in a duration for a video that never had one, without touching the
 * stored bytes. The watch allowance counts a view once a student has played a
 * whole duration's worth, so a video with `durationSeconds: 0` is exempt from
 * the limit entirely — the rule is only as real as this number.
 *
 * The index sits at the front, so the start of the file carries everything
 * ffprobe needs; only a stubborn file is decrypted in full.
 */
const backfillDuration = async (video, short, tmpDir) => {
  const probe = path.join(tmpDir, `${short}.probe.mp4`);
  try {
    const key = unwrapKey(video.encryption.wrappedKey, video.encryption.keyVersion || 1);
    const iv = Buffer.from(video.encryption.iv, 'hex');
    for (const bytes of [16 * 1024 * 1024, video.sizeBytes]) {
      await decryptTo(video.storagePath, key, iv, probe, Math.min(bytes, video.sizeBytes));
      try {
        const { stdout } = await execFileAsync('ffprobe', [
          '-v', 'error', '-print_format', 'json', '-show_format', probe,
        ], { maxBuffer: 8 * 1024 * 1024 });
        const seconds = Math.round(parseFloat(JSON.parse(stdout).format?.duration || 0));
        if (seconds > 0) {
          await Video.updateOne({ _id: video._id }, { $set: { durationSeconds: seconds } });
          return seconds;
        }
      } catch { /* try the whole file */ }
      if (bytes >= video.sizeBytes) break;
    }
    return 0;
  } finally {
    await fs.promises.unlink(probe).catch(() => {});
  }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const videos = await Video.find({ deletedAt: null, status: 'ready' })
    .select('+storagePath +encryption.wrappedKey +encryption.iv')
    .sort({ createdAt: -1 });

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'video-index-'));
  const affected = [];

  for (const video of videos) {
    const short = String(video._id).slice(-6);
    if (ONLY && !ONLY.includes(short)) continue;
    const head = path.join(tmpDir, `${short}.head`);
    try {
      const key = unwrapKey(video.encryption.wrappedKey, video.encryption.keyVersion || 1);
      const iv = Buffer.from(video.encryption.iv, 'hex');
      await decryptTo(video.storagePath, key, iv, head, 65536);
      const types = boxOrder(await fs.promises.readFile(head));
      const bad = indexIsLast(types);
      if (bad) affected.push({ video, short });
      const mb = String(Math.round(video.sizeBytes / 1048576)).padStart(5);
      console.log(`${bad ? 'INDEX LAST' : 'ok        '} ${short} ${mb}MB dur=${String(video.durationSeconds || 0).padStart(5)} ${types.join(' ').padEnd(20)} ${(video.title || '').slice(0, 32)}`);
    } catch (err) {
      console.log(`ERROR      ${short} ${err.message}`);
    } finally {
      await fs.promises.unlink(head).catch(() => {});
    }
  }

  console.log(`\n${affected.length} of ${videos.length} need repair.`);

  if (DURATIONS) {
    const missing = videos.filter((v) => !(v.durationSeconds > 0) && (!ONLY || ONLY.includes(String(v._id).slice(-6))));
    console.log(`\n${missing.length} without a duration — the watch allowance cannot count these.`);
    for (const video of missing) {
      const short = String(video._id).slice(-6);
      try {
        const seconds = await backfillDuration(video, short, tmpDir);
        console.log(`  ${short} ${seconds > 0 ? `duration=${seconds}s` : 'could not read a duration — left at 0'}  ${(video.title || '').slice(0, 32)}`);
      } catch (err) {
        console.log(`  ${short} FAILED: ${err.message.slice(0, 60)}`);
      }
    }
  }

  if (REPAIR) {
    for (const { video, short } of affected) {
      console.log(`\n--- ${short} "${(video.title || '').slice(0, 40)}" (${Math.round(video.sizeBytes / 1048576)}MB)`);
      try {
        await repairOne(video, short, tmpDir);
      } catch (err) {
        console.log(`    FAILED, left untouched: ${err.message}`);
      }
    }
  } else if (affected.length) {
    console.log('Run again with --repair to fix them.');
  }

  await fs.promises.rm(tmpDir, { recursive: true, force: true });
  await mongoose.disconnect();
})().catch((err) => { console.error('FAILED', err); process.exit(1); });
