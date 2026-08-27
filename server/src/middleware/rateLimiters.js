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

// Per-account buckets key on the submitted username (falls back to the IP when absent).
const accountKey = (req) => `u:${String(req.body?.username || req.ip || '').toLowerCase()}`;
const ACCOUNT_KEY = { keyGenerator: accountKey };

module.exports = {
  // Login: a relaxed per-IP bucket (a lecture hall shares one NAT) plus a strict per-account bucket.
  loginIpLimiter: build(15 * 60 * 1000, 30, 'Too many login attempts from this network. Try again in 15 minutes.'),
  loginAccountLimiter: build(15 * 60 * 1000, 10, 'Too many login attempts for this account. Try again in 15 minutes.', ACCOUNT_KEY),
  refreshLimiter: build(15 * 60 * 1000, 60, 'Too many session refreshes. Slow down.'),
  passwordLimiter: build(15 * 60 * 1000, 5, 'Too many password attempts. Try again later.'),
  verificationLimiter: build(15 * 60 * 1000, 20, 'Too many verification attempts. Try again later.'),
  codeRedemptionLimiter: build(15 * 60 * 1000, 10, 'Too many code attempts. Try again later.'),
  resetRequestIpLimiter: build(60 * 60 * 1000, 3, 'Too many device-reset requests. Try again later.'),
  resetRequestAccountLimiter: build(24 * 60 * 60 * 1000, 3, 'Too many device-reset requests for this account today.', ACCOUNT_KEY),
  quizWriteLimiter: build(60 * 1000, 120, 'Too many quiz saves. Slow down.'),
  uploadLimiter: build(60 * 1000, 120, 'Upload rate exceeded. Slow down.'),
  chunkLimiter: build(60 * 1000, 900, 'Upload rate exceeded. Slow down.'),
  searchLimiter: build(60 * 1000, 60, 'Too many searches. Slow down.'),
  generalLimiter: build(60 * 1000, 300, 'Too many requests. Please slow down.', {
    skip: (req) => CHUNK_UPLOAD_PATH.test(req.originalUrl),
  }),
  antiCheatLimiter: build(60 * 1000, 240, 'Event rate exceeded.'),
};
