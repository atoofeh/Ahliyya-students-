const ApiError = require('../core/ApiError');
const { ROLES } = require('../config/constants');
const { hasPermission } = require('../core/permissions');

/**
 * Role-based gate. Usage: authorize('admin', 'teacher').
 * The owner (super_admin) satisfies any check that admits 'admin'.
 */
const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const role = req.user.role;
  const ok = roles.includes(role) || (role === ROLES.SUPER_ADMIN && roles.includes(ROLES.ADMIN));
  if (!ok) return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
  next();
};

/** Permission gate. Usage: requirePermission(PERMISSIONS.USERS_CREATE). All listed permissions are required. */
const requirePermission = (...permissions) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const missing = permissions.find((p) => !hasPermission(req.user.role, p));
  if (missing) return next(ApiError.forbidden(`Missing permission: ${missing}`, 'FORBIDDEN'));
  next();
};

module.exports = authorize;
module.exports.authorize = authorize;
module.exports.requirePermission = requirePermission;
