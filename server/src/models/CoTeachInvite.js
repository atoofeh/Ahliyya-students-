const mongoose = require('mongoose');

/**
 * An invitation for another teacher to co-teach a course.
 *
 * The inviter must already run the course; the invitee must be a teacher. On
 * acceptance the invitee joins `Course.coTeachers` and gains the same authority
 * as the creator — content, students, grading, and Q&A moderation.
 *
 * The partial unique index stops a course accumulating duplicate open
 * invitations for the same person: the database enforces it, not just the
 * service, so two simultaneous clicks cannot both create one.
 */
const coTeachInviteSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invitee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: String, default: '', maxlength: 500 },

    status: { type: String, enum: ['pending', 'accepted', 'declined', 'cancelled'], default: 'pending' },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

coTeachInviteSchema.index(
  { course: 1, invitee: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
coTeachInviteSchema.index({ invitee: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('CoTeachInvite', coTeachInviteSchema);
