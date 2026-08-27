const env = require('./config/env');
const { logger } = require('./config/logger');
const { connectDB } = require('./config/db');
const app = require('./app');
const seed = require('./seed');
const { startJobs } = require('./jobs');

const start = async () => {
  await connectDB();
  if (env.NODE_ENV === 'production') {
    const User = require('./models/User');
    const hasOwner = await User.exists({ role: 'super_admin', deletedAt: null });
    if (!hasOwner) {
      logger.error('No owner account exists. Run: npm run seed (with SUPER_ADMIN_* configured) before starting in production.');
      process.exit(1);
    }
  } else {
    await seed();
  }
  startJobs();

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 LMS API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      const { disconnectDB } = require('./config/db');
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled rejection: ${err?.message}`, { stack: err?.stack });
  });
};

start().catch((err) => {
  logger.error(`Fatal startup error: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
