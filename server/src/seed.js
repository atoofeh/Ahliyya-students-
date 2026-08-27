const env = require('./config/env');
const { logger } = require('./config/logger');
const { ROLES } = require('./config/constants');

/**
 * Idempotent bootstrap. Creates, once each and only when absent:
 *   1. the platform owner (super_admin) from SUPER_ADMIN_*
 *   2. the default operational admin from DEFAULT_ADMIN_*
 *   3. the legacy `admin` development account (never in production)
 *   4. the settings singleton
 * Never modifies an existing account. Never logs a password.
 * Production with no owner and no SUPER_ADMIN_* configuration throws.
 */
const seed = async () => {
  const User = require('./models/User');
  const PlatformSetting = require('./models/PlatformSetting');
  const audit = require('./core/audit');
  const isProd = env.NODE_ENV === 'production';

  // 1. Owner
  const owner = await User.findOne({ role: ROLES.SUPER_ADMIN, deletedAt: null });
  if (!owner) {
    if (env.SUPER_ADMIN_EMAIL && env.SUPER_ADMIN_INITIAL_PASSWORD) {
      const created = await User.create({
        name: env.SUPER_ADMIN_NAME,
        username: env.SUPER_ADMIN_USERNAME,
        email: env.SUPER_ADMIN_EMAIL,
        password: env.SUPER_ADMIN_INITIAL_PASSWORD,
        role: ROLES.SUPER_ADMIN,
        status: 'active',
        emailVerified: true,
        mustChangePassword: true,
      });
      await audit({ user: created._id, action: 'USER_CREATED', targetUser: created._id, meta: { bootstrap: 'owner', role: ROLES.SUPER_ADMIN } });
      logger.info(`Owner account created (username: ${created.username}) — password change required at first login`);
    } else if (isProd) {
      throw new Error('No owner account exists and SUPER_ADMIN_EMAIL / SUPER_ADMIN_INITIAL_PASSWORD are not set. Configure them and run: npm run seed');
    } else {
      logger.warn('No owner account and SUPER_ADMIN_* not configured — owner bootstrap skipped');
    }
  }

  // 2. Default operational admin
  const defaultAdmin = await User.findOne({ username: env.DEFAULT_ADMIN_USERNAME });
  if (!defaultAdmin) {
    if (env.DEFAULT_ADMIN_INITIAL_PASSWORD) {
      const created = await User.create({
        name: env.DEFAULT_ADMIN_NAME,
        username: env.DEFAULT_ADMIN_USERNAME,
        email: env.DEFAULT_ADMIN_EMAIL || undefined,
        password: env.DEFAULT_ADMIN_INITIAL_PASSWORD,
        role: ROLES.ADMIN,
        status: 'active',
        emailVerified: true,
        mustChangePassword: true,
      });
      await audit({ user: created._id, action: 'ADMIN_CREATED', targetUser: created._id, meta: { bootstrap: true } });
      logger.info(`Default admin created (username: ${created.username}) — password change required at first login`);
    } else {
      logger.warn(`Default admin "${env.DEFAULT_ADMIN_USERNAME}" not present and DEFAULT_ADMIN_INITIAL_PASSWORD not set — skipped`);
    }
  }

  // 3. Legacy development admin
  if (!isProd && env.ADMIN_PASSWORD) {
    const legacy = await User.findOne({ username: 'admin' });
    if (!legacy) {
      await User.create({
        name: 'Platform Administrator',
        username: 'admin',
        email: env.ADMIN_EMAIL || undefined,
        password: env.ADMIN_PASSWORD,
        role: ROLES.ADMIN,
        status: 'active',
        emailVerified: true,
        mustChangePassword: false,
      });
      logger.info('Development admin seeded (username: admin / password from ADMIN_PASSWORD)');
    }
  }

  // 4. Settings singleton
  await PlatformSetting.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global', values: {} } },
    { upsert: true }
  );
};

module.exports = seed;
