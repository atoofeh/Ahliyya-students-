const mongoose = require('mongoose');

const qaReportSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  thread: { type: mongoose.Schema.Types.ObjectId, ref: 'QAThread', required: true, index: true },
  replyId: { type: mongoose.Schema.Types.ObjectId, default: null },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, enum: ['harassment', 'inappropriate', 'spam', 'other'], required: true },
  details: { type: String, default: '', maxlength: 1000 },
  status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open', index: true },
  resolution: { type: String, enum: ['removed', 'dismissed', null], default: null },
  resolutionNote: { type: String, default: '', maxlength: 500 },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

qaReportSchema.index(
  { reporter: 1, thread: 1, replyId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);
qaReportSchema.index({ course: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('QAReport', qaReportSchema);
