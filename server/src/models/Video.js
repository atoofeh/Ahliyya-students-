const mongoose = require('mongoose');
const { VIDEO_STATUS } = require('../config/constants');

/**
 * Video asset with chunked-upload state and encrypted-at-rest storage.
 * The raw file never sits in a public directory; it is encrypted with a
 * per-video AES-256-CTR key (wrapped by the platform master key) and is only
 * readable through the authenticated, signed streaming endpoint.
 */
const videoSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: 'video/mp4' },

    status: { type: String, enum: VIDEO_STATUS, default: 'uploading' },

    // Chunked upload state (enables resume of interrupted uploads)
    uploadId: { type: String, required: true, unique: true },
    totalChunks: { type: Number, required: true },
    receivedChunks: { type: [Number], default: [] },
    declaredSize: { type: Number, required: true },

    // Final asset
    sizeBytes: { type: Number, default: 0 }, // plaintext size (before encryption)
    durationSeconds: { type: Number, default: 0 },
    thumbnail: { type: String, default: null }, // FileAsset id
    storagePath: { type: String, default: null, select: false },
    encryption: {
      wrappedKey: { type: String, default: null, select: false },
      iv: { type: String, default: null, select: false }, // hex
      algorithm: { type: String, default: 'aes-256-ctr' },
    },

    // Renditions produced when ffmpeg is available on the host
    renditions: [
      {
        label: String, // e.g. '720p'
        storagePath: { type: String, select: false },
        sizeBytes: Number,
        wrappedKey: { type: String, select: false },
        iv: { type: String, select: false },
      },
    ],
    processingError: { type: String, default: null },

    viewCount: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

videoSchema.index({ course: 1, deletedAt: 1 });
videoSchema.index({ status: 1 });
videoSchema.index({ title: 'text' });

module.exports = mongoose.model('Video', videoSchema);
