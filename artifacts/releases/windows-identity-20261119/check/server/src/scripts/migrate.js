/**
 * Data migrations: `npm run migrate [-- --dry-run] [-- --force-relogin]`.
 * Applies every file in src/migrations (sorted) that is not yet recorded in
 * the _migrations collection. --dry-run prints intended operations only.
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const runMigrations = async ({ dryRun = false, forceRelogin = false, log = console.log } = {}) => {
  const Migration = require('../models/Migration');
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.js')).sort();
  const done = new Set((await Migration.find().lean()).map((m) => m.name));
  const applied = [];
  const skipped = [];

  for (const file of files) {
    const migration = require(path.join(MIGRATIONS_DIR, file));
    if (done.has(migration.name)) { skipped.push(migration.name); continue; }
    log(`${dryRun ? '[dry-run] ' : ''}migration ${migration.name}`);
    await migration.up({ dryRun, forceRelogin, log });
    if (dryRun) { skipped.push(migration.name); continue; }
    await Migration.create({ name: migration.name });
    applied.push(migration.name);
  }
  return { applied, skipped };
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const { connectDB, disconnectDB } = require('../config/db');
  const { logger } = require('../config/logger');
  connectDB()
    .then(() => runMigrations({ dryRun: args.includes('--dry-run'), forceRelogin: args.includes('--force-relogin') }))
    .then(async (r) => {
      logger.info(`Migrations applied: ${r.applied.join(', ') || 'none'}; skipped: ${r.skipped.join(', ') || 'none'}`);
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error(`Migration failed: ${err.message}`);
      await disconnectDB().catch(() => {});
      process.exit(1);
    });
}

module.exports = { runMigrations };
