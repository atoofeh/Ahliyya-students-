const mongoose = require('mongoose');

/**
 * Announcements: platform-wide (admin, course=null) or course-scoped (teacher).
 */
const announcementSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 10000 },
    pinned: { type: Boolean, default: false },
    publishedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

announcementSchema.index({ course: 1, deletedAt: 1, pinned: -1, publishedAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
