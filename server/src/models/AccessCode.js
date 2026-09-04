const mongoose = require('mongoose');
const { ENROLLMENT_PACKAGES } = require('../config/constants');

/** Enrollment codes: single or multi-use, optionally expiring. */
const accessCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    // What redeeming this code buys, carried onto the enrollment it creates.
    // Without it, every student who joined by code would be missing from the
    // payment figures and the totals would quietly understate what came in.
    package: { type: String, enum: ENROLLMENT_PACKAGES, default: 'full' },
    amountPaid: { type: Number, default: 0, min: 0 },
    maxUses: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0 },
    usedBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
      },
    ],
    expiresAt: { type: Date, default: null },
    grantsAccessDays: { type: Number, default: 0 }, // 0 = follow course expiry
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isRevoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

accessCodeSchema.index({ course: 1 });
accessCodeSchema.index({ expiresAt: 1 });

accessCodeSchema.virtual('isAvailable').get(function () {
  if (this.isRevoked) return false;
  if (this.usedCount >= this.maxUses) return false;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  return true;
});

accessCodeSchema.set('toJSON', { virtuals: true });
accessCodeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('AccessCode', accessCodeSchema);
