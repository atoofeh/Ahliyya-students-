/**
 * Let multi-device roles (the owner) hold several authorized devices.
 *
 * The Device collection's unique index previously covered every active device.
 * It now excludes documents carrying the `multiDevice` marker, so the database
 * still guarantees one active device per ordinary account while the owner may
 * have several. Changing a partial index requires dropping and recreating it,
 * which is what syncIndexes does here.
 *
 * Existing owner devices predate the marker, so they are stamped as part of the
 * migration — otherwise the owner's next login on a second device would collide
 * with the old constraint.
 */
const { ROLES } = require('../config/constants');

module.exports = {
  name: '003-owner-multi-device',
  async up({ dryRun, log }) {
    const User = require('../models/User');
    const Device = require('../models/Device');

    const owners = await User.find({ role: ROLES.SUPER_ADMIN, deletedAt: null }).select('_id username').lean();
    log(`  multi-device accounts: ${owners.length}${owners.length ? ` (${owners.map((o) => o.username).join(', ')})` : ''}`);

    const ownerIds = owners.map((o) => o._id);
    const toStamp = await Device.countDocuments({
      user: { $in: ownerIds },
      status: 'active',
      multiDevice: { $ne: true },
    });
    log(`  existing owner devices to mark: ${toStamp}`);

    if (!dryRun && toStamp > 0) {
      const res = await Device.updateMany(
        { user: { $in: ownerIds }, status: 'active', multiDevice: { $ne: true } },
        { $set: { multiDevice: true } }
      );
      log(`  marked ${res.modifiedCount} device(s)`);
    }

    // Documents written before this field existed have no value at all, and the
    // partial index filters on the literal false — they must be backfilled or
    // they drop out of the constraint entirely.
    const missing = await Device.countDocuments({ multiDevice: { $exists: false } });
    log(`  devices missing the flag (backfilled to false): ${missing}`);
    if (!dryRun && missing > 0) {
      await Device.updateMany({ multiDevice: { $exists: false } }, { $set: { multiDevice: false } });
    }

    log('  rebuild Device indexes (unique active device now excludes multiDevice)');
    if (!dryRun) {
      // syncIndexes drops indexes whose definition no longer matches and recreates them.
      const dropped = await Device.syncIndexes();
      log(`  indexes synced${Array.isArray(dropped) && dropped.length ? `, dropped: ${dropped.join(', ')}` : ''}`);
    }

    const remaining = await Device.countDocuments({ status: 'active', multiDevice: false });
    log(`  devices still under the one-device constraint: ${remaining}`);
  },
};
