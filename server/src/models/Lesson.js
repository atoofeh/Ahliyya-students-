const mongoose = require('mongoose');
const { LESSON_TYPES } = require('../config/constants');

const lessonSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: LESSON_TYPES, required: true },
    order: { type: Number, default: 0 },

    // Type-specific references
    video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', default: null },
    fileAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'FileAsset', default: null }, // pdf/document
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', default: null },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
    content: { type: String, default: '', maxlength: 100000 }, // rich text lessons

    durationMinutes: { type: Number, default: 0 },
    isPreview: { type: Boolean, default: false }, // viewable before enrollment
    isPublished: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

lessonSchema.index({ course: 1, section: 1, order: 1, deletedAt: 1 });
lessonSchema.index({ title: 'text' });

module.exports = mongoose.model('Lesson', lessonSchema);
