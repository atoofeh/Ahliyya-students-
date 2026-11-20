const mongoose = require('mongoose');
const { COURSE_VISIBILITY, COURSE_DIFFICULTY, DEFAULT_CURRENCY } = require('../config/constants');

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    thumbnail: { type: String, default: null }, // FileAsset id
    category: { type: String, trim: true, default: 'General', maxlength: 100 },
    tags: { type: [String], default: [] },
    // The creator. Kept as the course's owner for display and as the account
    // that can remove co-teachers; authority is otherwise shared.
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Teachers who accepted an invitation. Equal authority over content,
    // students, grading and moderation — see modules/courses/courseStaff.js.
    coTeachers: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },

    difficulty: { type: String, enum: COURSE_DIFFICULTY, default: 'beginner' },
    language: { type: String, default: 'en', maxlength: 10 },
    durationMinutes: { type: Number, default: 0 }, // aggregated from lessons

    // Commercial-readiness (payments arrive later; schema is ready now)
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: DEFAULT_CURRENCY, maxlength: 5 },

    enrollmentLimit: { type: Number, default: 0 }, // 0 = unlimited
    enrollmentCount: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null }, // course access end date
    visibility: { type: String, enum: Object.values(COURSE_VISIBILITY), default: COURSE_VISIBILITY.HIDDEN },
    isPublished: { type: Boolean, default: false },

    certificateEnabled: { type: Boolean, default: true },
    completionThreshold: { type: Number, default: 80, min: 0, max: 100 }, // % lessons for certificate

    // Aggregates (denormalized for catalog performance, updated by services)
    lessonCount: { type: Number, default: 0 },
    quizCount: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

courseSchema.index({ teacher: 1, deletedAt: 1 });
courseSchema.index({ coTeachers: 1, deletedAt: 1 });
courseSchema.index({ visibility: 1, isPublished: 1, deletedAt: 1 });
courseSchema.index({ category: 1 });
courseSchema.index({ title: 'text', description: 'text', category: 'text', tags: 'text' });

courseSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  }
  next();
});

module.exports = mongoose.model('Course', courseSchema);
