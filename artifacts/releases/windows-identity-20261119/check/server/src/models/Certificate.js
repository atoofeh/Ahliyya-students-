const mongoose = require('mongoose');

/**
 * Course completion certificate. `serial` is a verifiable public identifier
 * (QR-code ready: /verify/<serial> can be added without schema changes).
 */
const certificateSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    serial: { type: String, required: true, unique: true },
    issuedAt: { type: Date, default: Date.now },
    finalScore: { type: Number, default: null }, // avg quiz % at issue time
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

certificateSchema.index({ student: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Certificate', certificateSchema);
