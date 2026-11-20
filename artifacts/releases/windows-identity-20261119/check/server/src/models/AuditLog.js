const mongoose = require('mongoose');
const { AUDIT_ACTIONS } = require('../config/constants');

/** Immutable audit trail for every security-relevant action. */
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // actor
    action: { type: String, required: true, enum: AUDIT_ACTIONS },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    resource: { type: String, default: null }, // free-form resource ref, e.g. video:<id>
    ip: { type: String },
    deviceId: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetUser: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
