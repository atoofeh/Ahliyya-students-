const mongoose = require('mongoose');

/** A student's self-service "I lost my device" request, reviewed by an administrator. */
const deviceResetRequestSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, lowercase: true, trim: true, maxlength: 50 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '', maxlength: 300 },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolution: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

deviceResetRequestSchema.index({ status: 1, createdAt: -1 });
deviceResetRequestSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('DeviceResetRequest', deviceResetRequestSchema);
