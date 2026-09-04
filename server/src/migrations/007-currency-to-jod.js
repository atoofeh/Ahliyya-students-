/**
 * The institution's currency is the Jordanian dinar, not the US dollar.
 *
 * `USD` was only ever the schema's placeholder default — nothing set it
 * deliberately and no price was ever quoted in dollars — so this re-labels the
 * existing records to match reality.
 *
 * It is a re-label, not a conversion: no amount is multiplied by anything. That
 * is only safe while the amounts carrying the old label are zero, so the
 * migration counts the non-zero ones and refuses to touch them, printing what
 * it skipped. Turning a real 40 USD into 40 JOD silently would corrupt the
 * books far more quietly than leaving it alone.
 *
 * Courses that were given some other currency on purpose are left as they are.
 */
module.exports = {
  name: '007-currency-to-jod',
  async up({ dryRun, log }) {
    const Course = require('../models/Course');
    const Enrollment = require('../models/Enrollment');
    const courses = Course.collection;
    const enrollments = Enrollment.collection;

    const courseCount = await courses.countDocuments({ currency: 'USD' });
    const enrollCount = await enrollments.countDocuments({ currency: 'USD' });
    const withMoney = await enrollments.countDocuments({ currency: 'USD', amountPaid: { $gt: 0 } });
    const pricedCourses = await courses.countDocuments({ currency: 'USD', price: { $gt: 0 } });

    log(`  courses labelled USD:      ${courseCount} (${pricedCourses} with a price set)`);
    log(`  enrollments labelled USD:  ${enrollCount} (${withMoney} with an amount recorded)`);

    if (withMoney > 0 || pricedCourses > 0) {
      log('  SKIPPED: some records carry a real amount under the USD label.');
      log('  Re-labelling those would change what they mean. Convert or correct them');
      log('  by hand first, then run this again.');
      return;
    }
    if (dryRun) return;

    await courses.updateMany({ currency: 'USD' }, { $set: { currency: 'JOD' } });
    await enrollments.updateMany({ currency: 'USD' }, { $set: { currency: 'JOD' } });

    const left = await enrollments.countDocuments({ currency: 'USD' });
    log(`  done — ${courseCount} courses and ${enrollCount} enrollments now read JOD${left ? ` (${left} left)` : ''}`);
  },
};
