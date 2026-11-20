const mongoose = require('mongoose');

/** Immutable record of every login attempt (success and failure). */
const loginHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String, default: '' }, // preserved even for unknown users
    success: { type: Boolean, required: true },
    reason: { type: String, default: '' }, // e.g. bad_password, locked, banned
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    deviceId: { type: String, default: '' },
    fingerprint: { type: String, default: '' },
    location: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

loginHistorySchema.index({ user: 1, createdAt: -1 });
loginHistorySchema.index({ success: 1, createdAt: -1 });
loginHistorySchema.index({ ip: 1 });

module.exports = mongoose.model('LoginHistory', loginHistorySchema);
