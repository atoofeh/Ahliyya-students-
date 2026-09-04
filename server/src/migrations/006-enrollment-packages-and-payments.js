/**
 * Give every existing enrollment a package and a payment record.
 *
 * Mongoose defaults only apply to documents it creates, so enrollments made
 * before this feature have no `package` and no `amountPaid` at all. Left alone
 * they would be invisible to the payment summary — the totals would look right
 * while quietly counting a subset — so they are backfilled explicitly.
 *
 * Every existing student is recorded as `full` with nothing paid. That is the
 * honest reading: they were enrolled in the whole course, and what they handed
 * over was never captured here. An administrator can correct any of them from
 * the roster, and each correction is audited.
 */
module.exports = {
  name: '006-enrollment-packages-and-payments',
  async up({ dryRun, log }) {
    const Enrollment = require('../models/Enrollment');
    const AccessCode = require('../models/AccessCode');
    const Course = require('../models/Course');
    const enrollments = Enrollment.collection;
    const codes = AccessCode.collection;

    const missingPackage = await enrollments.countDocuments({ package: { $exists: false } });
    const missingAmount = await enrollments.countDocuments({ amountPaid: { $exists: false } });
    const codesMissing = await codes.countDocuments({ package: { $exists: false } });

    log(`  enrollments without a package: ${missingPackage}`);
    log(`  enrollments without an amount:  ${missingAmount}`);
    log(`  access codes without a package: ${codesMissing}`);
    if (dryRun) return;

    await enrollments.updateMany({ package: { $exists: false } }, { $set: { package: 'full' } });
    await enrollments.updateMany({ amountPaid: { $exists: false } }, { $set: { amountPaid: 0 } });
    await enrollments.updateMany(
      { paymentNote: { $exists: false } },
      { $set: { paymentNote: '', paymentRecordedBy: null, paymentRecordedAt: null } }
    );
    await codes.updateMany({ package: { $exists: false } }, { $set: { package: 'full', amountPaid: 0 } });

    // Each enrollment keeps the currency its course used at the time, so a later
    // change to the course cannot re-denominate what is already recorded.
    const byCurrency = await Course.find({}).select('currency').lean();
    const groups = new Map();
    for (const c of byCurrency) {
      const cur = c.currency || 'USD';
      if (!groups.has(cur)) groups.set(cur, []);
      groups.get(cur).push(c._id);
    }
    for (const [currency, ids] of groups) {
      await enrollments.updateMany({ course: { $in: ids }, currency: { $exists: false } }, { $set: { currency } });
    }

    const left = await enrollments.countDocuments({ package: { $exists: false } });
    if (left > 0) throw new Error(`${left} enrollments still have no package`);
    log(`  done — ${await enrollments.countDocuments({})} enrollments now carry a package and an amount`);
  },
};
