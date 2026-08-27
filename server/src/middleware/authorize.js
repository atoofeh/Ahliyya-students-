const ApiError = require('../core/ApiError');

/**
 * Role-based authorization. Usage: authorize('admin', 'teacher')
 */
const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
  }
  next();
};

module.exports = authorize;
