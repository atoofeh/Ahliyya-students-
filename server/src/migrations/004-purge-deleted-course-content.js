/**
 * Reclaim content left behind by course deletions that predate the cascade.
 *
 * Until now, deleting a course marked only the course itself. Its lessons,
 * quizzes and — the expensive part — its uploaded videos and documents stayed
 * marked live: still counted by the storage figure on the owner dashboard, and
 * still occupying disk, with nothing in the interface pointing at them.
 *
 * This finds content belonging to already-deleted courses, removes the media
 * bytes, and marks the records deleted so the dashboard reflects reality.
 *
 * Academic history is deliberately untouched: certificates, quiz attempts,
 * submissions and progress record what a student actually did, and the audit
 * log is never modified.
 *
 * --dry-run reports what it would reclaim without changing anything.
 */
const fs = require('fs');
const path = require('path');

module.exports = {
  name: '004-purge-deleted-course-content',
  async up({ dryRun, log }) {
    const Course = require('../models/Course');
    const Video = require('../models/Video');
    const FileAsset = require('../models/FileAsset');

    const deletedCourses = await Course.find({ deletedAt: { $ne: null } }).select('_id title').lean();
    log(`  deleted courses: ${deletedCourses.length}`);
    if (deletedCourses.length === 0) return;

    const ids = deletedCourses.map((c) => c._id);
    const now = new Date();
    const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

    const videos = await Video.find({ course: { $in: ids }, deletedAt: null }).select('+storagePath sizeBytes title').lean();
    const files = await FileAsset.find({ course: { $in: ids }, deletedAt: null }).select('+storagePath sizeBytes originalName').lean();
    const bytes = [...videos, ...files].reduce((n, x) => n + (x.sizeBytes || 0), 0);

    log(`  orphaned videos:     ${videos.length} (${mb(videos.reduce((n, v) => n + (v.sizeBytes || 0), 0))})`);
    videos.forEach((v) => log(`      ${v.title} — ${mb(v.sizeBytes || 0)}`));
    log(`  orphaned documents:  ${files.length} (${mb(files.reduce((n, f) => n + (f.sizeBytes || 0), 0))})`);
    log(`  total to reclaim:    ${mb(bytes)}`);

    if (dryRun) {
      log('  [dry-run] nothing removed');
      return;
    }

    let removed = 0;
    for (const v of videos) {
      // A video owns a directory; deleting one through the API removes it the same way.
      if (v.storagePath) {
        await fs.promises.rm(path.dirname(v.storagePath), { recursive: true, force: true }).catch((e) => log(`      could not remove ${v.storagePath}: ${e.message}`));
        removed += 1;
      }
    }
    for (const f of files) {
      if (f.storagePath) {
        await fs.promises.unlink(f.storagePath).catch(() => {});
        removed += 1;
      }
    }
    log(`  removed ${removed} item(s) from disk`);

    const models = {
      Section: require('../models/Section'),
      Lesson: require('../models/Lesson'),
      Video,
      FileAsset,
      Quiz: require('../models/Quiz'),
      Question: require('../models/Question'),
      Assignment: require('../models/Assignment'),
      Announcement: require('../models/Announcement'),
      QAThread: require('../models/QAThread'),
    };
    for (const [name, model] of Object.entries(models)) {
      const res = await model.updateMany(
        { course: { $in: ids }, deletedAt: null },
        { $set: { deletedAt: now } }
      );
      if (res.modifiedCount > 0) log(`  marked ${res.modifiedCount} ${name} record(s) deleted`);
    }

    const Enrollment = require('../models/Enrollment');
    const enr = await Enrollment.updateMany({ course: { $in: ids }, status: 'active' }, { $set: { status: 'removed' } });
    if (enr.modifiedCount > 0) log(`  closed ${enr.modifiedCount} lingering enrolment(s)`);
  },
};
