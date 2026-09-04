const mongoose = require('mongoose');
const { ENROLLMENT_PACKAGES } = require('../config/constants');

const enrollmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    status: { type: String, enum: ['active', 'expired', 'removed', 'completed'], default: 'active' },
    enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // admin/teacher assignment
    joinedViaCode: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessCode', default: null },
    expiresAt: { type: Date, default: null }, // per-student access expiry

    /**
     * What the student took, and what they paid for it.
     *
     * `package` is teaching information — a teacher needs to know whether a
     * student is with them for the midterm, the final or the whole course — so
     * it is visible to course staff. Everything below it is money, which only
     * administrators and the owner may see: the enrollment service strips these
     * fields from any response that is not going to one of them, so a teacher's
     * client never receives them rather than merely not displaying them.
     */
    package: { type: String, enum: ENROLLMENT_PACKAGES, default: 'full' },
    amountPaid: { type: Number, default: 0, min: 0 },
    // Copied from the course when the student enrols, so a later change to the
    // course's currency cannot silently re-denominate past payments.
    currency: { type: String, default: 'USD', maxlength: 5 },
    paymentNote: { type: String, default: '', maxlength: 300 },
    paymentRecordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    paymentRecordedAt: { type: Date, default: null },

    // Denormalized progress cache (recomputed by progress service)
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    completedLessons: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    certificate: { type: mongoose.Schema.Types.ObjectId, ref: 'Certificate', default: null },
    isFavorite: { type: Boolean, default: false },
    lastAccessedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ course: 1, status: 1 });
// Drives the per-course payment summary.
enrollmentSchema.index({ course: 1, status: 1, package: 1 });
enrollmentSchema.index({ student: 1, status: 1, lastAccessedAt: -1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
