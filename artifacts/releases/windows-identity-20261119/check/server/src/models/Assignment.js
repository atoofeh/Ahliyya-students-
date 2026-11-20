const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, trim: true, maxlength: 20000, default: '' },
    attachment: { type: mongoose.Schema.Types.ObjectId, ref: 'FileAsset', default: null },
    dueAt: { type: Date, default: null },
    maxPoints: { type: Number, default: 100, min: 0 },
    allowLateSubmission: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    reminderSentAt: { type: Date, default: null }, // claimed atomically by the deadline-reminder job
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

assignmentSchema.index({ course: 1, deletedAt: 1 });
assignmentSchema.index({ dueAt: 1 });
assignmentSchema.index({ title: 'text' });

module.exports = mongoose.model('Assignment', assignmentSchema);
