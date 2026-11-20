const mongoose = require('mongoose');

/**
 * Singleton settings document (key: 'global'). Values are merged over
 * defaults in config/settingsCache — unknown keys are ignored by consumers.
 */
const platformSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    values: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformSetting', platformSettingSchema);
