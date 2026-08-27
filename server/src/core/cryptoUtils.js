const crypto = require('crypto');
const env = require('../config/env');

const MASTER_KEY = crypto.createHash('sha256').update(env.MEDIA_MASTER_KEY).digest(); // 32 bytes

/**
 * Media crypto utilities.
 *
 * Videos are encrypted at rest with AES-256-CTR using a random per-video key.
 * CTR mode allows random access: for any byte offset we can compute the
 * counter block and start decrypting mid-file, which is what HTTP Range
 * streaming requires. Per-video keys are wrapped (encrypted) with the master
 * key before being stored in the database.
 */

const generateVideoKey = () => ({
  key: crypto.randomBytes(32),
  iv: crypto.randomBytes(16),
});

/** Wrap a per-video key with the master key for DB storage. */
const wrapKey = (keyBuffer) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const wrapped = Buffer.concat([cipher.update(keyBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, wrapped]).toString('base64');
};

/** Unwrap a stored per-video key. */
const unwrapKey = (wrappedB64) => {
  const raw = Buffer.from(wrappedB64, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const wrapped = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(wrapped), decipher.final()]);
};

/**
 * Compute the CTR counter for a given byte offset (AES block = 16 bytes).
 * Returns { counterIv, skipBytes } — decryption must discard skipBytes
 * from the first block to align to the requested offset.
 */
const ctrParamsForOffset = (iv, byteOffset) => {
  const blockIndex = Math.floor(byteOffset / 16);
  const skipBytes = byteOffset % 16;

  // Treat IV as a 128-bit big-endian counter and add blockIndex.
  const counter = Buffer.from(iv);
  let carry = BigInt(blockIndex);
  for (let i = 15; i >= 0 && carry > 0n; i--) {
    const sum = BigInt(counter[i]) + (carry & 0xffn);
    counter[i] = Number(sum & 0xffn);
    carry = (carry >> 8n) + (sum >> 8n);
  }
  return { counterIv: counter, skipBytes };
};

const createEncryptStream = (key, iv) => crypto.createCipheriv('aes-256-ctr', key, iv);

const createDecryptStreamAtOffset = (key, iv, byteOffset) => {
  const { counterIv, skipBytes } = ctrParamsForOffset(iv, byteOffset);
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, counterIv);
  return { decipher, skipBytes };
};

/** Constant-time string comparison. */
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

module.exports = {
  generateVideoKey,
  wrapKey,
  unwrapKey,
  createEncryptStream,
  createDecryptStreamAtOffset,
  ctrParamsForOffset,
  safeEqual,
  sha256,
  randomToken,
};
