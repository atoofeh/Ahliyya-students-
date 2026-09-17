const mongoose = require('mongoose');

/**
 * How much of a video one student has actually watched.
 *
 * The platform limits how many times a student may watch a lesson video. The
 * unit is a *view*, and a view is one video's worth of watching — not one
 * click. Opening a video, watching ten seconds and closing it again costs
 * nothing; watching it end to end costs one. That is the only counting that
 * matches what the rule is trying to express, and it is the only one a student
 * cannot burn through by accident.
 *
 * `watchedSeconds` accumulates from the player's progress reports, which are
 * capped per call, so a scrub to the end adds nothing. Each time the total
 * passes another whole duration, `completedViews` goes up by one.
 *
 * Kept apart from LessonProgress: that is a resume position and an engagement
 * figure for analytics, and it is per lesson. This is a quota, it is per
 * video, and it decides whether playback is allowed at all.
 */
const videoViewSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },

    /** Total seconds of real playback, across every sitting. */
    watchedSeconds: { type: Number, default: 0, min: 0 },
    /** Whole times through. watchedSeconds / duration, as it crosses each boundary. */
    completedViews: { type: Number, default: 0, min: 0 },
    /** Seconds counted towards the view currently in progress. */
    secondsThisView: { type: Number, default: 0, min: 0 },

    lastWatchedAt: { type: Date, default: Date.now },
    /** Set when an administrator gives the student their views back. */
    resetAt: { type: Date, default: null },
    resetBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

videoViewSchema.index({ student: 1, video: 1 }, { unique: true });
videoViewSchema.index({ course: 1, student: 1 });

module.exports = mongoose.model('VideoView', videoViewSchema);
