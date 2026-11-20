const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('./ApiError');

const SIGNING_KEY = crypto.createHash('sha256').update(`sign:${env.MEDIA_MASTER_KEY}`).digest();

/**
 * Short-lived HMAC-signed access tokens for media streaming.
 * A token binds: resource id + user id + session id + expiry.
 * Tokens are passed as a query parameter because <video> tags cannot send
 * Authorization headers.
 */
const signStreamToken = ({ resourceId, userId, sessionId, ttlSeconds = 300 }) => {
  const exp = Date.now() + ttlSeconds * 1000;
  const payload = `${resourceId}.${userId}.${sessionId}.${exp}`;
  const sig = crypto.createHmac('sha256', SIGNING_KEY).update(payload).digest('base64url');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
};

const verifyStreamToken = (token, expectedResourceId) => {
  let decoded;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    throw ApiError.unauthorized('Invalid stream token', 'STREAM_TOKEN_INVALID');
  }

  const parts = decoded.split('.');
  if (parts.length !== 5) throw ApiError.unauthorized('Invalid stream token', 'STREAM_TOKEN_INVALID');

  const [resourceId, userId, sessionId, expStr, sig] = parts;
  const payload = `${resourceId}.${userId}.${sessionId}.${expStr}`;
  const expected = crypto.createHmac('sha256', SIGNING_KEY).update(payload).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw ApiError.unauthorized('Invalid stream token signature', 'STREAM_TOKEN_INVALID');
  }
  if (Number(expStr) < Date.now()) {
    throw ApiError.unauthorized('Stream token expired', 'STREAM_TOKEN_EXPIRED');
  }
  if (expectedResourceId && resourceId !== String(expectedResourceId)) {
    throw ApiError.forbidden('Stream token does not match resource', 'STREAM_TOKEN_MISMATCH');
  }

  return { resourceId, userId, sessionId, exp: Number(expStr) };
};

module.exports = { signStreamToken, verifyStreamToken };
