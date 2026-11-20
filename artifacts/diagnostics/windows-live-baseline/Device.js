const mongoose = require('mongoose');

/**
 * Authorized device for an account. The partial unique index on { user }
 * where status is 'active' and multiDevice is false makes the DATABASE
 * guarantee at most one active device per ordinary user — concurrent first
 * logins cannot both bind. Devices of multi-device roles are flagged and fall
 * outside the constraint.
 * The device credential (the client's random device id) is stored only as a
 * SHA-256 hash; publicId is a short display handle derived from it.
 */
const deviceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceKeyHash: { type: String, required: true, select: false },
    publicId: { type: String, required: true },
    fingerprintHash: { type: String, default: null },

    platform: { type: String, enum: ['web', 'android', 'ios', 'other'], default: 'web' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    deviceType: { type: String, default: 'desktop' },
    model: { type: String, default: '' },
    appVersion: { type: String, default: '' },

    firstAuthorizedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    lastIp: { type: String, default: '' },

    // True on devices belonging to a multi-device role (see core/permissions).
    // The partial index below filters on the literal false, so this needs a
    // default rather than being absent: MongoDB partial filters accept
    // { $exists: true } but not { $exists: false }.
    multiDevice: { type: Boolean, default: false },

    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revocationReason: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true }
);

deviceSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: 'active', multiDevice: false } }
);
deviceSchema.index({ user: 1, createdAt: -1 });

deviceSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    publicId: this.publicId,
    platform: this.platform,
    browser: this.browser,
    os: this.os,
    deviceType: this.deviceType,
    model: this.model,
    appVersion: this.appVersion,
    firstAuthorizedAt: this.firstAuthorizedAt,
    lastSeenAt: this.lastSeenAt,
    lastIp: this.lastIp,
    multiDevice: !!this.multiDevice,
    status: this.status,
    revokedAt: this.revokedAt,
    revocationReason: this.revocationReason,
  };
};

module.exports = mongoose.model('Device', deviceSchema);
