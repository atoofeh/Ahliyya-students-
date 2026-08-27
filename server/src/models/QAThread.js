const mongoose = require('mongoose');

const replySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 10000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

/** Student question on a course/lesson with threaded replies. */
const qaThreadSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, required: true, maxlength: 10000 },
    replies: { type: [replySchema], default: [] },
    resolved: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

qaThreadSchema.index({ course: 1, deletedAt: 1, createdAt: -1 });
qaThreadSchema.index({ author: 1 });
qaThreadSchema.index({ title: 'text', body: 'text' });

module.exports = mongoose.model('QAThread', qaThreadSchema);
