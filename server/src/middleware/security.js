const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const env = require('../config/env');

/**
 * Consolidated security middleware stack:
 *  - helmet: security headers + Content Security Policy
 *  - CORS restricted to the configured client origin
 *  - hpp: HTTP parameter pollution guard
 *  - NoSQL-injection sanitization ($ / dotted keys stripped from body & params)
 *  - compression for API responses
 *  - cookie parsing (refresh tokens live in httpOnly cookies)
 */

// Recursively strip Mongo operator keys. (express-mongo-sanitize mutates
// req.query which Express 5 exposes as a getter — so we sanitize manually.)
const stripUnsafeKeys = (value) => {
  if (Array.isArray(value)) return value.map(stripUnsafeKeys);
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      clean[k] = stripUnsafeKeys(v);
    }
    return clean;
  }
  return value;
};

const sanitizeRequest = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') req.body = stripUnsafeKeys(req.body);
  if (req.params && typeof req.params === 'object') {
    for (const k of Object.keys(req.params)) {
      if (typeof req.params[k] === 'string' && (req.params[k].startsWith('$') || req.params[k].includes('{'))) {
        req.params[k] = req.params[k].replace(/[${}]/g, '');
      }
    }
  }
  next();
};

const applySecurity = (app) => {
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'", env.CLIENT_URL],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // media streamed to the SPA origin
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'x-fingerprint'],
    })
  );

  app.use(hpp());
  app.use(compression());
  app.use(cookieParser());
  app.use(sanitizeRequest);
};

module.exports = { applySecurity, sanitizeRequest };
