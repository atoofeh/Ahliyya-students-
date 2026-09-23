const mongoose = require('mongoose');

/**
 * Any non-video stored file: PDFs, documents, images, thumbnails,
 * assignment attachments, global admin documents. Files are served only
 * through authenticated endpoints — storagePath is never exposed.
 */
const fileAssetSchema = new mongoose.Schema(
  {
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null }, // null = global
    kind: { type: String, enum: ['documents', 'images'], required: true },
    // 'news' and 'past_paper' are institution-wide and readable by anyone signed
    // in — the serving route's course/enrollment checks apply to 'course' and
    // 'question' only.
    scope: {
      type: String,
      enum: ['course', 'global', 'avatar', 'thumbnail', 'question', 'submission', 'news', 'past_paper'],
      default: 'course',
    },
    // What a person calls the file, as opposed to what it was called on the
    // uploader's disk. Used by the past-papers library, where "أجوبة عربي
    // استدراكي" is the name and the filename is an accident.
    title: { type: String, trim: true, maxlength: 200, default: '' },
    subject: { type: String, trim: true, maxlength: 100, default: '' },
    // Past papers only: whether this paper's practice questions are open to
    // students. Off until an administrator has read them through, because a
    // practice question with the wrong answer teaches the wrong answer.
    practicePublished: { type: Boolean, default: false },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    storagePath: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    downloadable: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

fileAssetSchema.index({ course: 1, deletedAt: 1 });
fileAssetSchema.index({ scope: 1, deletedAt: 1 });
fileAssetSchema.index({ originalName: 'text' });

module.exports = mongoose.model('FileAsset', fileAssetSchema);
