const { ROLES } = require('../config/constants');

/**
 * Four-role hierarchy + Device collection.
 * Role values are unchanged (admin stays admin; the owner is created by the
 * seed), so this verifies data, ensures the Device indexes, and optionally
 * forces every user to sign in again under the device policy.
 */
module.exports = {
  name: '001-roles-and-devices',
  async up({ dryRun, forceRelogin, log }) {
    const User = require('../models/User');
    const Session = require('../models/Session');
    const Device = require('../models/Device');
    const audit = require('../core/audit');

    const counts = await User.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$role', n: { $sum: 1 } } },
    ]);
    for (const c of counts) log(`  role ${c._id}: ${c.n} user(s)`);
    const unknown = counts.filter((c) => !Object.values(ROLES).includes(c._id));
    if (unknown.length) throw new Error(`Unknown role values present: ${unknown.map((u) => u._id).join(', ')}`);

    log('  ensure Device indexes (unique active device per user)');
    if (!dryRun) await Device.syncIndexes();

    if (forceRelogin) {
      const users = await User.countDocuments({});
      const sessions = await Session.countDocuments({ isActive: true });
      log(`  force re-login: bump tokenVersion for ${users} user(s), end ${sessions} active session(s)`);
      if (!dryRun) {
        await User.updateMany({}, { $inc: { tokenVersion: 1 } });
        await Session.updateMany({ isActive: true }, { $set: { isActive: false, endedAt: new Date(), endReason: 'policy_relogin' } });
        await audit({ action: 'POLICY_RELOGIN', meta: { users, sessions, migration: '001-roles-and-devices' } });
      }
    }
  },
};
