/**
 * Operational API error with HTTP status and machine-readable code.
 * Throw from services; the global error handler serializes it.
 */
class ApiError extends Error {
  constructor(statusCode, message, code = undefined, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, code, details) { return new ApiError(400, message, code, details); }
  static unauthorized(message = 'Authentication required', code) { return new ApiError(401, message, code); }
  static forbidden(message = 'Access denied', code) { return new ApiError(403, message, code); }
  static notFound(message = 'Resource not found', code) { return new ApiError(404, message, code); }
  static conflict(message, code) { return new ApiError(409, message, code); }
  static tooMany(message = 'Too many requests', code) { return new ApiError(429, message, code); }
  static internal(message = 'Internal server error') { return new ApiError(500, message); }
}

module.exports = ApiError;
