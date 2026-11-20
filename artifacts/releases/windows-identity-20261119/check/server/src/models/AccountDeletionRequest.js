const mongoose = require('mongoose');

const accountDeletionRequestSchema = new mongoose.Schema({
  // Cleared on completion so the receipt can be retained without identifying
  // the deleted account.
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reason: { type: String, default: '', maxlength: 1000 },
  status: { type: String, enum: ['open', 'completed', 'dismissed'], default: 'open', index: true },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },
  resolutionNote: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

accountDeletionRequestSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);
accountDeletionRequestSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('AccountDeletionRequest', accountDeletionRequestSchema);
