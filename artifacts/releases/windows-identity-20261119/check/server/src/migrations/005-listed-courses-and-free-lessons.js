/**
 * Replace the public-course feature with free lessons.
 *
 * Course visibility used to be public | private | hidden, where "public" meant
 * open self-enrolment and private and hidden behaved identically. It is now
 * listed | hidden:
 *
 *   public  → listed  (stays discoverable in the catalog; enrolment now needs
 *                      an access code or a staff assignment, so the catalog is
 *                      a shop window rather than a door)
 *   private → hidden  (behaviour unchanged — neither was ever in the catalog)
 *   hidden  → hidden
 *
 * No course becomes more visible than it was.
 *
 * Lesson.isPreview was declared but never enforced anywhere; it becomes
 * Lesson.isFree, which the lesson route and the video stream-token issuer both
 * honour. Values carry over unchanged.
 */
module.exports = {
  name: '005-listed-courses-and-free-lessons',
  async up({ dryRun, log }) {
    const Course = require('../models/Course');
    const Lesson = require('../models/Lesson');
    const courses = Course.collection;
    const lessons = Lesson.collection;

    const pub = await courses.countDocuments({ visibility: 'public' });
    const priv = await courses.countDocuments({ visibility: 'private' });
    const legacyPreview = await lessons.countDocuments({ isPreview: { $exists: true } });
    const freeAlready = await lessons.countDocuments({ isPreview: true });
    const missingFree = await lessons.countDocuments({ isFree: { $exists: false } });

    log(`  public → listed:        ${pub}`);
    log(`  private → hidden:       ${priv}`);
    log(`  lessons with isPreview: ${legacyPreview} (${freeAlready} were true)`);
    log(`  lessons missing isFree: ${missingFree}`);
    if (dryRun) return;

    await courses.updateMany({ visibility: 'public' }, { $set: { visibility: 'listed' } });
    await courses.updateMany({ visibility: 'private' }, { $set: { visibility: 'hidden' } });

    // Carry the old flag's value over, then drop it so one lesson cannot end up
    // with two disagreeing "is this free?" fields.
    await lessons.updateMany({ isPreview: true }, { $set: { isFree: true } });
    await lessons.updateMany({ isFree: { $exists: false } }, { $set: { isFree: false } });
    await lessons.updateMany({ isPreview: { $exists: true } }, { $unset: { isPreview: '' } });

    const stillPublic = await courses.countDocuments({ visibility: { $nin: ['listed', 'hidden'] } });
    if (stillPublic > 0) throw new Error(`${stillPublic} courses still hold an unknown visibility`);
    log(`  done — listed: ${await courses.countDocuments({ visibility: 'listed' })}, hidden: ${await courses.countDocuments({ visibility: 'hidden' })}`);
  },
};
