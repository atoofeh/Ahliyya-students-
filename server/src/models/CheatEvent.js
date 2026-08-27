const mongoose = require('mongoose');
const { CHEAT_EVENTS } = require('../config/constants');

/**
 * Individual suspicious event captured by the client-side proctor during a
 * quiz attempt (or video session). Aggregated into attempt.riskScore.
 */
const cheatEventSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', default: null },
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'QuizAttempt', default: null },
    type: { type: String, enum: CHEAT_EVENTS, required: true },
    detail: { type: String, default: '', maxlength: 1000 },
    weight: { type: Number, default: 1 },
    ip: { type: String, default: '' },
    fingerprint: { type: String, default: '' },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

cheatEventSchema.index({ attempt: 1, createdAt: 1 });
cheatEventSchema.index({ student: 1, createdAt: -1 });
cheatEventSchema.index({ course: 1, type: 1 });

module.exports = mongoose.model('CheatEvent', cheatEventSchema);
