const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// RATE_LIMIT_MULTIPLIER scales every bucket (the test harness sets 100; production leaves 1).
const MULTIPLIER = env.RATE_LIMIT_MULTIPLIER;

const build = (windowMs, max, message, options = {}) =>
  rateLimit({
    windowMs,
    max: max * MULTIPLIER,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message, code: 'RATE_LIMITED' },
    ...options,
  });

// Video chunk uploads are high-frequency by design (8 MB per request, up to 3
// in parallel) — they get their own generous budget and are exempted from the
// general limiter so a long upload cannot starve normal app traffic.
const CHUNK_UPLOAD_PATH = /^\/api\/v1\/videos\/uploads\/[^/]+\/chunks(\?|$)/;

module.exports = {
  // Brute-force protection on credentials endpoints.
  loginLimiter: build(15 * 60 * 1000, 10, 'Too many login attempts. Try again in 15 minutes.'),
  passwordLimiter: build(15 * 60 * 1000, 5, 'Too many password attempts. Try again later.'),
  verificationLimiter: build(15 * 60 * 1000, 20, 'Too many verification attempts. Try again later.'),
  codeRedemptionLimiter: build(15 * 60 * 1000, 10, 'Too many code attempts. Try again later.'),
  uploadLimiter: build(60 * 1000, 120, 'Upload rate exceeded. Slow down.'),
  chunkLimiter: build(60 * 1000, 900, 'Upload rate exceeded. Slow down.'),
  searchLimiter: build(60 * 1000, 60, 'Too many searches. Slow down.'),
  generalLimiter: build(60 * 1000, 300, 'Too many requests. Please slow down.', {
    skip: (req) => CHUNK_UPLOAD_PATH.test(req.originalUrl),
  }),
  antiCheatLimiter: build(60 * 1000, 240, 'Event rate exceeded.'),
};
