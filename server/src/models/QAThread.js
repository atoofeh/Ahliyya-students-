const mongoose = require('mongoose');

const replySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 10000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

/**
 * Student question on a course/lesson with threaded replies.
 *
 * Questions are moderated: a new one starts 'pending' and is invisible to
 * everyone except its author and the course staff. A teacher approves it (it
 * joins the course Q&A) or rejects it (it never appears, and the record is kept
 * only so the decision is auditable).
 */
const qaThreadSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, required: true, maxlength: 10000 },
    replies: { type: [replySchema], default: [] },
    resolved: { type: Boolean, default: false },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    moderatedAt: { type: Date, default: null },
    // Shown to the asker so a rejection is not silent; never shown to others.
    rejectionReason: { type: String, default: null, maxlength: 300 },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

qaThreadSchema.index({ course: 1, deletedAt: 1, createdAt: -1 });
// The moderation queue: pending questions for one course, oldest first.
qaThreadSchema.index({ course: 1, status: 1, createdAt: 1 });
qaThreadSchema.index({ author: 1 });
qaThreadSchema.index({ title: 'text', body: 'text' });

module.exports = mongoose.model('QAThread', qaThreadSchema);
