const mongoose = require('mongoose');

/** Ordered grouping of lessons inside a course (a "chapter"). */
const sectionSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    order: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sectionSchema.index({ course: 1, order: 1, deletedAt: 1 });

module.exports = mongoose.model('Section', sectionSchema);
