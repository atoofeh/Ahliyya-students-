require('dotenv').config();
const crypto = require('crypto');
const { z } = require('zod');

/**
 * Centralized, validated environment configuration.
 * Every module reads config from here — never from process.env directly.
 */
// '' in .env means "unset" for optional values.
const blankToUndefined = (v) => (v === '' ? undefined : v);
const optional = (schema) => z.preprocess(blankToUndefined, schema.optional());
const passwordRule = z.string().min(8).max(128)
  .regex(/[a-z]/, 'needs a lowercase letter')
  .regex(/[A-Z]/, 'needs an uppercase letter')
  .regex(/\d/, 'needs a digit');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/lms-platform'),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Master key used to wrap per-video encryption keys and sign stream URLs.
  // If absent in development, a deterministic key derived from JWT_SECRET is used.
  MEDIA_MASTER_KEY: optional(z.string().min(32)),

  CLIENT_URL: z.string().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default(''),
  REFRESH_COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).default('lax'),
  RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).default(1),

  // Media key rotation: new videos wrap with MEDIA_MASTER_KEY (MEDIA_KEY_VERSION);
  // videos wrapped under the previous version unwrap with MEDIA_MASTER_KEY_PREVIOUS.
  // Firebase admin credentials, base64 of the service-account JSON. Present
  // means the server can push to phones that have the app closed; absent means
  // notifications still work in the app and in its shade while it runs, which
  // is why this is optional rather than required.
  FIREBASE_SERVICE_ACCOUNT_KEY: optional(z.string().min(100)),

  MEDIA_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  MEDIA_MASTER_KEY_PREVIOUS: optional(z.string().min(32)),

  // Optional ClamAV daemon (fail-closed when set but unreachable).
  CLAMAV_HOST: optional(z.string()),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().default(15000),

  // Owner (super_admin) bootstrap — created once by `npm run seed` / dev startup.
  SUPER_ADMIN_NAME: z.string().min(2).max(100).default('Platform Owner'),
  SUPER_ADMIN_USERNAME: z.string().min(3).max(50).default('owner'),
  SUPER_ADMIN_EMAIL: optional(z.string().email()),
  SUPER_ADMIN_INITIAL_PASSWORD: optional(passwordRule),

  // Default operational administrator (Abdullah Dabbas).
  DEFAULT_ADMIN_NAME: z.string().min(2).max(100).default('Abdullah Dabbas'),
  DEFAULT_ADMIN_USERNAME: z.string().min(3).max(50).default('abdullah.dabbas'),
  DEFAULT_ADMIN_EMAIL: optional(z.string().email()),
  DEFAULT_ADMIN_INITIAL_PASSWORD: optional(passwordRule),

  // Legacy development admin — never seeded in production, no default password.
  ADMIN_EMAIL: optional(z.string().email()),
  ADMIN_PASSWORD: optional(passwordRule),

  STORAGE_ROOT: optional(z.string()),
  LOG_DIR: optional(z.string()),
  MAX_UPLOAD_MB: z.coerce.number().default(2048),
  CHUNK_SIZE_MB: z.coerce.number().default(8),

  SMTP_HOST: optional(z.string()),
  SMTP_PORT: optional(z.coerce.number()),
  SMTP_USER: optional(z.string()),
  SMTP_PASS: optional(z.string()),
  SMTP_FROM: z.string().default('LMS Platform <no-reply@lms.local>'),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

// Derive a media master key in development if none provided.
if (!env.MEDIA_MASTER_KEY) {
  if (env.NODE_ENV === 'production') {
    console.error('❌ MEDIA_MASTER_KEY is required in production.');
    process.exit(1);
  }
  env.MEDIA_MASTER_KEY = crypto
    .createHash('sha256')
    .update(`media:${env.JWT_SECRET}`)
    .digest('hex');
}

// Production: every secret must be its own random value.
if (env.NODE_ENV === 'production') {
  const pairs = [
    ['JWT_SECRET', 'JWT_REFRESH_SECRET'], ['JWT_SECRET', 'MEDIA_MASTER_KEY'],
    ['JWT_REFRESH_SECRET', 'MEDIA_MASTER_KEY'], ['MEDIA_MASTER_KEY', 'MEDIA_MASTER_KEY_PREVIOUS'],
  ];
  for (const [a, b] of pairs) {
    if (env[a] && env[b] && env[a] === env[b]) {
      console.error(`❌ ${a} and ${b} must be different values.`);
      process.exit(1);
    }
  }
}

const path = require('path');
env.STORAGE_ROOT = env.STORAGE_ROOT || path.join(__dirname, '..', '..', 'storage');
env.LOG_DIR = env.LOG_DIR || path.join(__dirname, '..', '..', 'logs');

module.exports = env;
