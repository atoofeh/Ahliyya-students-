const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    text: { type: String, default: '', maxlength: 50000 },
    attachment: { type: mongoose.Schema.Types.ObjectId, ref: 'FileAsset', default: null },
    submittedAt: { type: Date, default: Date.now },
    isLate: { type: Boolean, default: false },

    status: { type: String, enum: ['submitted', 'graded', 'returned'], default: 'submitted' },
    pointsAwarded: { type: Number, default: null },
    feedback: { type: String, default: '' },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

submissionSchema.index({ assignment: 1, student: 1 }, { unique: true });
submissionSchema.index({ course: 1, status: 1 });
submissionSchema.index({ student: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
