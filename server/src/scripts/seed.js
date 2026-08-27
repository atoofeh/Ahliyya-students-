/** Explicit bootstrap: `npm run seed`. Safe to run repeatedly. */
const { connectDB, disconnectDB } = require('../config/db');
const { logger } = require('../config/logger');
const seed = require('../seed');

connectDB()
  .then(seed)
  .then(async () => { logger.info('Seed complete'); await disconnectDB(); process.exit(0); })
  .catch(async (err) => { logger.error(`Seed failed: ${err.message}`); await disconnectDB().catch(() => {}); process.exit(1); });
