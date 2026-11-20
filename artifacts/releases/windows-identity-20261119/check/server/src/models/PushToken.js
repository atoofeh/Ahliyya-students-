const mongoose = require('mongoose');

/**
 * One Firebase messaging token per app installation.
 *
 * Kept apart from `Device` on purpose. A device is the platform's identity for
 * the one-device rule and survives a reinstall; an FCM token is a delivery
 * address that Firebase rotates on its own schedule and invalidates when the
 * app is reinstalled or its data cleared. Tying the two together would mean a
 * routine token rotation touching the record that decides whether someone can
 * sign in at all.
 *
 * The token is the unique key, not the user: the same phone handed to a
 * different account must not end up pushing one person's questions to another.
 * Re-registering an existing token simply moves it to its current owner.
 */
const pushTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, default: 'android', maxlength: 20 },
    // The authorised-device id this registration came from, so signing out of
    // one phone drops only that phone's token.
    deviceId: { type: String, default: null, index: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushToken', pushTokenSchema);
