const fs = require('fs');
const { isAdminRole } = require('../../core/permissions');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const { staffCourseFilter } = require('../courses/courseStaff');
const execFileAsync = promisify(execFile);

const env = require('../../config/env');
const { logger } = require('../../config/logger');
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { STORAGE } = require('../../middleware/uploads');
const {
  generateVideoKey, wrapKey, unwrapKey, createEncryptStream, createDecryptStreamAtOffset,
} = require('../../core/cryptoUtils');
const { signStreamToken, verifyStreamToken } = require('../../core/signedUrl');
const { UPLOAD } = require('../../config/constants');
const Video = require('../../models/Video');
const Session = require('../../models/Session');
const Enrollment = require('../../models/Enrollment');
const Course = require('../../models/Course');
const LessonProgress = require('../../models/LessonProgress');
const FileAsset = require('../../models/FileAsset');

const CHUNK_DIR = (uploadId) => path.join(STORAGE.tmp, `upload-${uploadId}`);

/** Detect ffmpeg/ffprobe once at startup; processing degrades gracefully. */
let ffmpegAvailable = null;
const hasFfmpeg = async () => {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await execFileAsync('ffprobe', ['-version']);
    await execFileAsync('ffmpeg', ['-version']);
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
    logger.warn('ffmpeg not found — videos are stored as uploaded (no compression/renditions/thumbnails). Install ffmpeg to enable processing.');
  }
  return ffmpegAvailable;
};

class VideoService {
  // ── Chunked upload lifecycle ───────────────────────────────────────

  static async initUpload({ courseId, userId, title, originalName, sizeBytes, mimeType }) {
    const { getSettings } = require('../../config/settingsCache');
    const settings = await getSettings();
    const maxBytes = (settings.maxUploadMb || env.MAX_UPLOAD_MB) * 1024 * 1024;
    if (sizeBytes > maxBytes) {
      throw ApiError.badRequest(`Video exceeds the ${Math.round(maxBytes / 1048576)} MB upload limit`, 'FILE_TOO_LARGE');
    }
    const ext = path.extname(originalName || '').toLowerCase();
    if (!UPLOAD.ALLOWED_VIDEO_TYPES.includes(ext)) {
      throw ApiError.badRequest(`Video type ${ext} not supported`, 'BAD_FILE_TYPE');
    }

    const chunkSize = env.CHUNK_SIZE_MB * 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil(sizeBytes / chunkSize));
    const uploadId = uuidv4();
    fs.mkdirSync(CHUNK_DIR(uploadId), { recursive: true });
    const lastVideo = await Video.findOne({ course: courseId, deletedAt: null }).sort({ order: -1 }).select('order').lean();

    const video = await Video.create({
      course: courseId,
      uploadedBy: userId,
      title: title || originalName,
      order: (lastVideo?.order ?? -1) + 1,
      originalName,
      mimeType: mimeType || 'video/mp4',
      uploadId,
      totalChunks,
      declaredSize: sizeBytes,
      status: 'uploading',
    });

    return { video, uploadId, chunkSize, totalChunks };
  }

  static async saveChunk(uploadId, chunkIndex, buffer, userId) {
    const video = await Video.findOne({ uploadId, deletedAt: null });
    if (!video) throw ApiError.notFound('Upload not found');
    if (String(video.uploadedBy) !== String(userId)) throw ApiError.forbidden('Not your upload');
    if (video.status !== 'uploading') throw ApiError.badRequest('Upload already finalized');
    if (chunkIndex < 0 || chunkIndex >= video.totalChunks) throw ApiError.badRequest('Chunk index out of range');

    await fs.promises.writeFile(path.join(CHUNK_DIR(uploadId), `chunk-${chunkIndex}`), buffer);
    if (!video.receivedChunks.includes(chunkIndex)) {
      video.receivedChunks.push(chunkIndex);
      await video.save();
    }
    return { received: video.receivedChunks.length, total: video.totalChunks };
  }

  /** Resume support: client asks which chunks the server already has. */
  static async uploadStatus(uploadId, userId) {
    const video = await Video.findOne({ uploadId, deletedAt: null });
    if (!video) throw ApiError.notFound('Upload not found');
    if (String(video.uploadedBy) !== String(userId)) throw ApiError.forbidden('Not your upload');
    return {
      videoId: video._id,
      status: video.status,
      receivedChunks: video.receivedChunks,
      totalChunks: video.totalChunks,
    };
  }

  static async completeUpload(uploadId, userId, ip) {
    const video = await Video.findOne({ uploadId, deletedAt: null }).select('+storagePath +encryption.wrappedKey +encryption.iv');
    if (!video) throw ApiError.notFound('Upload not found');
    if (String(video.uploadedBy) !== String(userId)) throw ApiError.forbidden('Not your upload');
    if (video.status !== 'uploading') return video;
    if (video.receivedChunks.length !== video.totalChunks) {
      const missing = [];
      for (let i = 0; i < video.totalChunks; i++) if (!video.receivedChunks.includes(i)) missing.push(i);
      throw ApiError.badRequest(`Missing chunks: ${missing.slice(0, 20).join(', ')}`, 'CHUNKS_MISSING', { missing });
    }

    video.status = 'processing';
    await video.save();

    // Assemble + process asynchronously so the HTTP request returns fast.
    setImmediate(() => {
      VideoService.#processUpload(video._id).catch(async (err) => {
        logger.error(`Video processing failed for ${video._id}: ${err.message}`);
        await Video.updateOne({ _id: video._id }, { $set: { status: 'failed', processingError: err.message } });
      });
    });

    await audit({ user: userId, action: 'VIDEO_UPLOADED', course: video.course, ip, resource: `video:${video._id}` });
    return video;
  }

  static async #processUpload(videoId) {
    const video = await Video.findById(videoId).select('+storagePath +encryption.wrappedKey +encryption.iv');
    const dir = CHUNK_DIR(video.uploadId);
    const assembledPath = path.join(STORAGE.tmp, `assembled-${video.uploadId}${path.extname(video.originalName || '.mp4')}`);

    // 1. Assemble chunks in order.
    const out = fs.createWriteStream(assembledPath);
    for (let i = 0; i < video.totalChunks; i++) {
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(path.join(dir, `chunk-${i}`));
        readStream.on('error', reject);
        readStream.on('end', resolve);
        readStream.pipe(out, { end: false });
      });
    }
    await new Promise((resolve) => out.end(resolve));

    const stat = await fs.promises.stat(assembledPath);

    // Container sniff: ftyp box at offset 4 (mp4/mov/m4v) or EBML header (webm/mkv).
    const head = Buffer.alloc(12);
    const fd = await fs.promises.open(assembledPath, 'r');
    try { await fd.read(head, 0, 12, 0); } finally { await fd.close(); }
    const isIsoBmff = head.subarray(4, 8).toString('latin1') === 'ftyp';
    const isEbml = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    if (!isIsoBmff && !isEbml) {
      await fs.promises.unlink(assembledPath).catch(() => {});
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      throw new Error('Not a recognised video container (expected MP4/MOV/M4V or WebM/MKV)');
    }

    // 2. Probe duration + generate thumbnail while the file is still plaintext.
    if (await hasFfmpeg()) {
      try {
        const { stdout } = await execFileAsync('ffprobe', [
          '-v', 'quiet', '-print_format', 'json', '-show_format', assembledPath,
        ]);
        const info = JSON.parse(stdout);
        video.durationSeconds = Math.round(parseFloat(info.format?.duration || 0));

        const thumbPath = path.join(STORAGE.images, `${uuidv4()}.jpg`);
        await execFileAsync('ffmpeg', [
          '-ss', String(Math.min(5, Math.max(0, video.durationSeconds / 10))),
          '-i', assembledPath, '-frames:v', '1', '-vf', 'scale=640:-1', '-y', thumbPath,
        ]);
        const thumbStat = await fs.promises.stat(thumbPath);
        const thumbAsset = await FileAsset.create({
          uploadedBy: video.uploadedBy,
          course: video.course,
          kind: 'images',
          scope: 'thumbnail',
          originalName: `${video.title}-thumb.jpg`,
          storedName: path.basename(thumbPath),
          storagePath: thumbPath,
          mimeType: 'image/jpeg',
          sizeBytes: thumbStat.size,
        });
        video.thumbnail = String(thumbAsset._id);
      } catch (err) {
        logger.warn(`ffmpeg probe/thumbnail failed for ${video._id}: ${err.message}`);
      }
    }

    // 3. Encrypt at rest (AES-256-CTR, per-video key wrapped by master key).
    const { key, iv } = generateVideoKey();
    const videoDir = path.join(STORAGE.videos, String(video._id));
    fs.mkdirSync(videoDir, { recursive: true });
    const encryptedPath = path.join(videoDir, 'source.enc');

    await new Promise((resolve, reject) => {
      fs.createReadStream(assembledPath)
        .pipe(createEncryptStream(key, iv))
        .pipe(fs.createWriteStream(encryptedPath))
        .on('finish', resolve)
        .on('error', reject);
    });

    video.storagePath = encryptedPath;
    const { wrapped, keyVersion } = wrapKey(key);
    video.encryption = { wrappedKey: wrapped, iv: iv.toString('hex'), algorithm: 'aes-256-ctr', keyVersion };
    video.sizeBytes = stat.size;
    video.status = 'ready';
    await video.save();

    // 4. Cleanup plaintext + chunks.
    await fs.promises.unlink(assembledPath).catch(() => {});
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    logger.info(`Video ${video._id} processed and encrypted (${Math.round(stat.size / 1048576)} MB)`);
  }

  // ── Playback ────────────────────────────────────────────────────────

  /**
   * Does this video sit on a lesson the teacher marked free, on a course they
   * listed and published? Uses the same predicate as the lesson route, so a
   * video can never be more (or less) reachable than the lesson holding it.
   */
  static async #isFreePreviewVideo(video) {
    const { isFreeLessonMedia } = require('../../middleware/courseAccess');
    return isFreeLessonMedia({ courseId: video.course, video: video._id });
  }

  /** Issue a short-lived signed stream token (called from the player). */
  static async issueStreamToken(videoId, user, sessionId) {
    const video = await Video.findOne({ _id: videoId, deletedAt: null });
    if (!video) throw ApiError.notFound('Video not found');

    // Access first (admin, course staff, actively enrolled student, or anyone
    // signed in when the video sits on a free lesson) — an outsider must not
    // learn whether the video exists or is still processing.
    if (user.role === 'student') {
      const enrollment = await Enrollment.findOne({ student: user.id, course: video.course, status: 'active' });
      if (!enrollment && !(await VideoService.#isFreePreviewVideo(video))) {
        throw ApiError.forbidden('Not enrolled in this course');
      }
    } else if (user.role === 'teacher') {
      const owns = await Course.findOne({ _id: video.course, ...staffCourseFilter(user.id) });
      if (!owns && !(await VideoService.#isFreePreviewVideo(video))) {
        throw ApiError.forbidden('Not your course');
      }
    }
    if (video.status !== 'ready') throw ApiError.badRequest('Video is still processing', 'VIDEO_NOT_READY');

    // The watch limit applies to students only. Teachers review their own
    // material and administrators support it; spending their quota on that
    // would make the platform unusable for the people running it.
    let views = null;
    if (user.role === 'student') {
      views = await VideoService.viewsFor(user.id, video);
      if (views.exhausted) {
        await audit({
          user: user.id, action: 'VIDEO_VIEWS_EXHAUSTED', course: video.course,
          resource: `video:${videoId}`, meta: { used: views.used, limit: views.limit },
        });
        throw ApiError.forbidden(
          `You have watched this video the maximum of ${views.limit} times. Ask your teacher if you need it reopened.`,
          'VIDEO_VIEW_LIMIT'
        );
      }
    }

    const token = signStreamToken({ resourceId: String(videoId), userId: String(user.id), sessionId: String(sessionId), ttlSeconds: 300 });
    return {
      token,
      expiresInSeconds: 300,
      // The player shows this so a limit is never a surprise at view four.
      ...(views && { viewsUsed: views.used, viewsRemaining: views.remaining, viewLimit: views.limit }),
    };
  }

  /**
   * Stream decrypted bytes with HTTP Range support. The signed token is
   * validated against the video AND the caller's session must still be
   * active — a terminated session cannot keep streaming.
   */
  static async stream(videoId, token, rangeHeader, res) {
    const claims = verifyStreamToken(token, String(videoId));

    const [video, session] = await Promise.all([
      Video.findOne({ _id: videoId, deletedAt: null }).select('+storagePath +encryption.wrappedKey +encryption.iv'),
      Session.findById(claims.sessionId),
    ]);
    if (!video || video.status !== 'ready') throw ApiError.notFound('Video not available');
    if (!session || !session.isActive) throw ApiError.unauthorized('Session ended', 'SESSION_TERMINATED');

    const key = unwrapKey(video.encryption.wrappedKey, video.encryption.keyVersion || 1);
    const iv = Buffer.from(video.encryption.iv, 'hex');
    const totalSize = video.sizeBytes;

    let start = 0;
    let end = totalSize - 1;
    if (rangeHeader) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      if (match) {
        if (match[1]) start = parseInt(match[1], 10);
        if (match[2]) end = Math.min(parseInt(match[2], 10), totalSize - 1);
        if (start > end || start >= totalSize) {
          res.status(416).set('Content-Range', `bytes */${totalSize}`).end();
          return;
        }
      }
    }

    const chunkLength = end - start + 1;
    res.status(rangeHeader ? 206 : 200);
    res.set({
      'Content-Type': video.mimeType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkLength,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(rangeHeader && { 'Content-Range': `bytes ${start}-${end}/${totalSize}` }),
    });

    // CTR random access: align decryption to the AES block containing `start`.
    const { decipher, skipBytes } = createDecryptStreamAtOffset(key, iv, start);
    const fileStream = fs.createReadStream(video.storagePath, { start: start - skipBytes + 0, end });

    // We must read encrypted bytes from (start - skipBytes) so the first
    // decrypted block aligns, then drop skipBytes plaintext bytes.
    let dropped = 0;
    fileStream.pipe(decipher);
    decipher.on('data', (chunk) => {
      let data = chunk;
      if (dropped < skipBytes) {
        const toDrop = Math.min(skipBytes - dropped, data.length);
        data = data.subarray(toDrop);
        dropped += toDrop;
        if (!data.length) return;
      }
      if (!res.write(data)) {
        decipher.pause();
        res.once('drain', () => decipher.resume());
      }
    });
    decipher.on('end', () => res.end());
    decipher.on('error', () => res.destroy());
    res.on('close', () => {
      fileStream.destroy();
      decipher.destroy();
    });

    // Fire-and-forget view counting (only on stream start, not every range).
    if (start === 0) {
      Video.updateOne({ _id: videoId }, { $inc: { viewCount: 1 } }).exec();
      audit({ user: claims.userId, action: 'VIDEO_ACCESSED', course: video.course, resource: `video:${videoId}` });
    }
  }

  // ── Progress & management ───────────────────────────────────────────

  /**
   * How many whole times this student has watched this video, and what the
   * limit is. `remaining: null` means the limit is switched off.
   */
  static async viewsFor(studentId, video) {
    const { getSettings } = require('../../config/settingsCache');
    const settings = await getSettings();
    const limit = settings.maxVideoViews ?? 0;
    const VideoView = require('../../models/VideoView');
    const row = await VideoView.findOne({ student: studentId, video: video._id }).lean();
    const used = row?.completedViews || 0;
    return {
      limit,
      used,
      remaining: limit > 0 ? Math.max(0, limit - used) : null,
      exhausted: limit > 0 && used >= limit,
      secondsThisView: row?.secondsThisView || 0,
    };
  }

  /**
   * Add real playback time to a student's view count.
   *
   * Only whole passes through the video count. The delta is the player's
   * report of seconds actually played, already capped by the caller, so a drag
   * of the scrubber to the end adds nothing — which is the difference between
   * counting views and counting clicks.
   */
  static async #recordWatchTime(studentId, video, delta) {
    if (!(delta > 0) || !(video.durationSeconds > 0)) return;
    const VideoView = require('../../models/VideoView');

    const row = await VideoView.findOneAndUpdate(
      { student: studentId, video: video._id },
      { $setOnInsert: { course: video.course }, $set: { lastWatchedAt: new Date() }, $inc: { watchedSeconds: delta, secondsThisView: delta } },
      { upsert: true, new: true }
    );

    // Each whole duration watched is one more view. A student who watches
    // twice as long in one sitting spends two.
    if (row.secondsThisView >= video.durationSeconds) {
      const earned = Math.floor(row.secondsThisView / video.durationSeconds);
      await VideoView.updateOne(
        { _id: row._id },
        { $inc: { completedViews: earned, secondsThisView: -(earned * video.durationSeconds) } }
      );
    }
  }

  static async saveProgress(userId, videoId, { lessonId, positionSeconds, watchedDelta }) {
    const video = await Video.findOne({ _id: videoId, deletedAt: null });
    if (!video) throw ApiError.notFound('Video not found');

    const delta = Math.min(Math.max(0, watchedDelta || 0), 120);
    await VideoService.#recordWatchTime(userId, video, delta);

    const update = {
      $set: { course: video.course, positionSeconds: Math.max(0, positionSeconds), lastAccessedAt: new Date() },
      $inc: { watchedSeconds: delta },
    };
    const progress = await LessonProgress.findOneAndUpdate(
      { student: userId, lesson: lessonId },
      update,
      { upsert: true, new: true }
    );

    // Auto-complete when 90%+ watched.
    if (video.durationSeconds > 0 && !progress.completed && positionSeconds >= video.durationSeconds * 0.9) {
      const EnrollmentService = require('../enrollments/enrollments.service');
      await LessonProgress.updateOne({ _id: progress._id }, { $set: { completed: true, completedAt: new Date() } });
      await EnrollmentService.recomputeProgress(userId, video.course);
    }
    return progress;
  }

  /**
   * Give a student their views back on one video.
   *
   * A legitimate need — a lost connection that burned a view, a student
   * revising for a resit — and without it the rule turns every mishap into a
   * dead end. Course staff can do it for their own course; the reset is
   * audited with who asked for it.
   */
  static async resetViews(courseId, videoId, studentId, actor, ip) {
    const VideoView = require('../../models/VideoView');
    const video = await Video.findOne({ _id: videoId, course: courseId, deletedAt: null });
    if (!video) throw ApiError.notFound('Video not found');

    const row = await VideoView.findOneAndUpdate(
      { student: studentId, video: videoId },
      {
        $setOnInsert: { course: courseId },
        $set: { completedViews: 0, secondsThisView: 0, resetAt: new Date(), resetBy: actor.id },
      },
      { upsert: true, new: true }
    );
    await audit({
      user: actor.id, action: 'VIDEO_VIEWS_RESET', course: courseId, targetUser: studentId,
      ip, resource: `video:${videoId}`,
    });
    return row;
  }

  /** Who has watched this video, and how much of their allowance is left. */
  static async courseVideoViews(courseId, videoId) {
    const VideoView = require('../../models/VideoView');
    const { getSettings } = require('../../config/settingsCache');
    const settings = await getSettings();
    const limit = settings.maxVideoViews ?? 0;
    const rows = await VideoView.find({ video: videoId, course: courseId })
      .populate('student', 'name username')
      .sort({ completedViews: -1 })
      .lean();
    return {
      limit,
      items: rows.map((r) => ({
        student: r.student,
        completedViews: r.completedViews,
        watchedSeconds: r.watchedSeconds,
        exhausted: limit > 0 && r.completedViews >= limit,
        lastWatchedAt: r.lastWatchedAt,
        resetAt: r.resetAt,
      })),
    };
  }

  static async listCourseVideos(courseId) {
    return Video.find({ course: courseId, deletedAt: null })
      .select('title order status durationSeconds sizeBytes viewCount thumbnail createdAt originalName totalChunks receivedChunks uploadId')
      .sort({ order: 1, createdAt: -1 })
      .lean();
  }

  static async deleteVideo(videoId, user, ip) {
    const video = await Video.findOne({ _id: videoId, deletedAt: null }).select('+storagePath');
    if (!video) throw ApiError.notFound('Video not found');
    if (!isAdminRole(user.role)) {
      const owns = await Course.findOne({ _id: video.course, ...staffCourseFilter(user.id) });
      if (!owns) throw ApiError.forbidden('Not your course');
    }
    video.deletedAt = new Date();
    await video.save();
    if (video.storagePath) {
      fs.promises.rm(path.dirname(video.storagePath), { recursive: true, force: true }).catch(() => {});
    }
    await audit({ user: user.id, action: 'VIDEO_DELETED', course: video.course, ip, resource: `video:${videoId}` });
  }

  /** Watermark payload the player overlays on the video (piracy deterrent). */
  static async watermarkData(user, req) {
    const { getSettings } = require('../../config/settingsCache');
    const settings = await getSettings();
    if (!settings.watermarkEnabled) return { enabled: false };
    return {
      enabled: true,
      lines: [
        `${user.name} (${user.id})`,
        ...(settings.watermarkShowIp ? [req.ip] : []),
      ],
    };
  }
}

module.exports = VideoService;
