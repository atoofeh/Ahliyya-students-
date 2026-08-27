const express = require('express');
const env = require('./config/env');
const { logger } = require('./config/logger');
const { applySecurity } = require('./middleware/security');
const { generalLimiter } = require('./middleware/rateLimiters');
const errorHandler = require('./middleware/errorHandler');
const ApiError = require('./core/ApiError');
const { redactUrl } = require('./core/redact');

const app = express();

applySecurity(app);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging (http channel)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.http?.(`${req.method} ${redactUrl(req.originalUrl)} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.use('/api', generalLimiter);
app.use('/api/v1', require('./routes/v1'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: 'v1', timestamp: new Date().toISOString(), env: env.NODE_ENV });
});

// 404 for unknown API routes
app.use('/api', (_req, _res, next) => next(ApiError.notFound('Endpoint not found')));

app.use(errorHandler);

module.exports = app;
