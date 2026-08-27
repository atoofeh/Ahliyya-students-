const mongoose = require('mongoose');

/**
 * Per-student lesson progress: completion + resume position for videos.
 * Powers "continue watching", course progress bars, and certificates.
 */
const lessonProgressSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    positionSeconds: { type: Number, default: 0 }, // video resume point
    watchedSeconds: { type: Number, default: 0 }, // engagement accumulator
    lastAccessedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

lessonProgressSchema.index({ student: 1, lesson: 1 }, { unique: true });
lessonProgressSchema.index({ student: 1, course: 1 });
lessonProgressSchema.index({ student: 1, lastAccessedAt: -1 });

module.exports = mongoose.model('LessonProgress', lessonProgressSchema);
