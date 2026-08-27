const mongoose = require('mongoose');

/** One row per applied data migration (see src/scripts/migrate.js). */
const migrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    appliedAt: { type: Date, default: Date.now },
  },
  { collection: '_migrations' }
);

module.exports = mongoose.model('Migration', migrationSchema);
