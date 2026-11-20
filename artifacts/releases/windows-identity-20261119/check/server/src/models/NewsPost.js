const mongoose = require('mongoose');

/**
 * A post on the institution's news feed.
 *
 * Deliberately not an Announcement. An announcement is a notification: it is
 * addressed to a course, it pushes, and it is read once. A news post is a wall
 * anyone signed in can scroll — pictures of a graduation, an exam timetable, a
 * new intake — and it stays there. Mixing the two would mean every photo of a
 * prize-giving buzzing every student's phone.
 *
 * Images live in the ordinary file store with scope 'news', so they are served
 * through the same authorised route as everything else rather than a public
 * directory.
 */
const newsPostSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true, maxlength: 200, default: '' },
    body: { type: String, trim: true, maxlength: 5000, default: '' },
    // FileAsset ids. A post is a picture, a caption, or both.
    images: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The feed: pinned first, then newest.
newsPostSchema.index({ deletedAt: 1, pinned: -1, createdAt: -1 });

module.exports = mongoose.model('NewsPost', newsPostSchema);
