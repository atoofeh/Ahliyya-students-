/**
 * Re-wrap every stored per-video key under the CURRENT master key so
 * MEDIA_MASTER_KEY_PREVIOUS can be retired. Safe to re-run: videos already
 * on the current version are skipped.
 */
module.exports = {
  name: '002-rewrap-media-keys',
  async up({ dryRun, log }) {
    const env = require('../config/env');
    const Video = require('../models/Video');
    const { unwrapKey, wrapKey } = require('../core/cryptoUtils');
    const audit = require('../core/audit');
    const stale = await Video.find({ deletedAt: null, status: 'ready', 'encryption.keyVersion': { $ne: env.MEDIA_KEY_VERSION } })
      .select('+encryption.wrappedKey +encryption.iv');
    log(`  ${stale.length} video(s) wrapped under an older key version`);
    if (dryRun) return;
    let done = 0;
    for (const video of stale) {
      const key = unwrapKey(video.encryption.wrappedKey, video.encryption.keyVersion || 1);
      const { wrapped, keyVersion } = wrapKey(key);
      await Video.updateOne({ _id: video._id }, { $set: { 'encryption.wrappedKey': wrapped, 'encryption.keyVersion': keyVersion } });
      done += 1;
    }
    await audit({ action: 'MEDIA_KEY_REWRAPPED', meta: { videos: done, toVersion: env.MEDIA_KEY_VERSION } });
    log(`  re-wrapped ${done} video(s) to version ${env.MEDIA_KEY_VERSION}`);
  },
};
