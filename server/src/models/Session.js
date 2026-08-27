const mongoose = require('mongoose');

/**
 * One document per login session. The platform enforces a SINGLE active
 * session per user: creating a new session deactivates all others, which
 * immediately invalidates the old device's tokens (auth middleware checks
 * session.isActive on every request).
 */
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    refreshTokenHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },

    // Authorized-device binding: the session is pinned to the device that created it.
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', default: null },
    deviceKeyHash: { type: String, default: null, select: false },

    // Device identity
    deviceId: { type: String, required: true },
    fingerprint: { type: String, default: null }, // client-computed browser fingerprint hash
    userAgent: { type: String, default: '' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    deviceType: { type: String, default: 'desktop' },
    ip: { type: String, default: '' },
    location: { type: String, default: '' },

    rememberMe: { type: Boolean, default: false },
    lastActivityAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    endReason: {
      type: String,
      enum: [null, 'logout', 'new_device_login', 'admin_force_logout', 'inactivity_timeout', 'password_changed',
        'refresh_rotated_reuse', 'device_revoked', 'device_mismatch', 'policy_relogin'],
      default: null,
    },
  },
  { timestamps: true }
);

sessionSchema.index({ user: 1, isActive: 1 });
sessionSchema.index({ lastActivityAt: 1 });
sessionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Session', sessionSchema);
