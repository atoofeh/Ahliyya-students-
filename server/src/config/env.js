require('dotenv').config();
const crypto = require('crypto');
const { z } = require('zod');

/**
 * Centralized, validated environment configuration.
 * Every module reads config from here — never from process.env directly.
 */
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
  MEDIA_MASTER_KEY: z.string().optional(),

  CLIENT_URL: z.string().default('http://localhost:5173'),

  ADMIN_EMAIL: z.string().default('admin@lms.local'),
  ADMIN_PASSWORD: z.string().default('Admin@12345'),

  STORAGE_ROOT: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(2048),
  CHUNK_SIZE_MB: z.coerce.number().default(8),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('LMS Platform <no-reply@lms.local>'),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

// Derive a media master key in development if none provided.
if (!env.MEDIA_MASTER_KEY) {
  if (env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error('❌ MEDIA_MASTER_KEY is required in production.');
    process.exit(1);
  }
  env.MEDIA_MASTER_KEY = crypto
    .createHash('sha256')
    .update(`media:${env.JWT_SECRET}`)
    .digest('hex');
}

const path = require('path');
env.STORAGE_ROOT = env.STORAGE_ROOT || path.join(__dirname, '..', '..', 'storage');

module.exports = env;
