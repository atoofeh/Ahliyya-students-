const env = require('./config/env');
const { logger } = require('./config/logger');

/**
 * Idempotent bootstrap seeding: ensures a platform administrator exists and
 * the settings singleton is present.
 */
const seed = async () => {
  const User = require('./models/User');
  const PlatformSetting = require('./models/PlatformSetting');

  const adminExists = await User.findOne({ role: 'admin', deletedAt: null });
  if (!adminExists) {
    await User.create({
      name: 'Platform Administrator',
      username: 'admin',
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      role: 'admin',
      status: 'active',
      emailVerified: true,
      mustChangePassword: false,
    });
    logger.info(`Admin user seeded (username: admin / password from ADMIN_PASSWORD env)`);
  }

  await PlatformSetting.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global', values: {} } },
    { upsert: true }
  );
};

module.exports = seed;
