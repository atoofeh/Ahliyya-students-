const mongoose = require('mongoose');

/** Student bookmark on a lesson, optionally at a video timestamp. */
const bookmarkSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    note: { type: String, default: '', maxlength: 1000 },
    timestampSeconds: { type: Number, default: null },
  },
  { timestamps: true }
);

bookmarkSchema.index({ student: 1, createdAt: -1 });
bookmarkSchema.index({ student: 1, lesson: 1 });

module.exports = mongoose.model('Bookmark', bookmarkSchema);
