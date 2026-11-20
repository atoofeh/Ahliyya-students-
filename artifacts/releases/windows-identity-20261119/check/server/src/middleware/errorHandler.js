const { logger } = require('../config/logger');
const env = require('../config/env');

/**
 * Global error handler. Serializes ApiError, Mongoose, Zod, and multer errors
 * into a consistent envelope: { message, code?, errors? }.
 */
const errorHandler = (err, req, res, _next) => {
  // Operational (expected) errors
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      message: err.message,
      ...(err.code && { code: err.code }),
      ...(err.details && { errors: err.details }),
    });
  }

  if (err.name === 'ValidationError' && err.errors) {
    return res.status(400).json({
      message: 'Validation error',
      code: 'VALIDATION_ERROR',
      errors: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ message: `Duplicate value for ${field}`, code: 'DUPLICATE' });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path}: ${err.value}`, code: 'INVALID_ID' });
  }

  if (err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ message: `Upload error: ${err.message}`, code: err.code });
  }

  // Unexpected errors — log with stack, hide internals from clients.
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`, { stack: err.stack });
  res.status(err.statusCode || 500).json({
    message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
