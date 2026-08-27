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
    scope: { type: String, enum: ['course', 'global', 'avatar', 'thumbnail', 'question', 'submission'], default: 'course' },
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
