const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    status: { type: String, enum: ['active', 'expired', 'removed', 'completed'], default: 'active' },
    enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // admin/teacher assignment
    joinedViaCode: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessCode', default: null },
    expiresAt: { type: Date, default: null }, // per-student access expiry

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
enrollmentSchema.index({ student: 1, status: 1, lastAccessedAt: -1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
