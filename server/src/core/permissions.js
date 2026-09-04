const { ROLES, ROLE_RANK } = require('../config/constants');

/**
 * Central permission model. Roles map to permission sets; routes declare the
 * permission they need with requirePermission(); services that act on a
 * specific target still apply owner/admin protections (admin.service) and
 * course ownership (courseAccess) on top of this.
 */
const PERMISSIONS = Object.freeze({
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_SUSPEND: 'users.suspend',
  USERS_DELETE: 'users.delete',
  USERS_RESET_PASSWORD: 'users.reset_password',
  USERS_FORCE_LOGOUT: 'users.force_logout',
  ADMINS_VIEW: 'admins.view',
  ADMINS_CREATE: 'admins.create',
  ADMINS_MANAGE: 'admins.manage',
  COURSES_MANAGE_ANY: 'courses.manage_any',
  COURSES_MANAGE_OWN: 'courses.manage_own',
  ENROLLMENTS_MANAGE: 'enrollments.manage',
  ACCESS_CODES_MANAGE: 'access_codes.manage',
  SESSIONS_VIEW: 'sessions.view',
  SESSIONS_REVOKE: 'sessions.revoke',
  DEVICES_VIEW: 'devices.view',
  DEVICES_RESET: 'devices.reset',
  AUDIT_VIEW: 'audit.view',
  LOGIN_HISTORY_VIEW: 'login_history.view',
  ANTICHEAT_PLATFORM: 'anticheat.platform',
  ANALYTICS_GLOBAL: 'analytics.global',
  ANNOUNCEMENTS_GLOBAL: 'announcements.global',
  FILES_GLOBAL: 'files.global',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',
  SECURITY_MANAGE: 'security.manage',
  MAINTENANCE_MANAGE: 'maintenance.manage',
});

const OWNER_ONLY = new Set([PERMISSIONS.ADMINS_CREATE, PERMISSIONS.ADMINS_MANAGE, PERMISSIONS.SECURITY_MANAGE]);

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.STUDENT]: new Set(),
  [ROLES.TEACHER]: new Set([PERMISSIONS.COURSES_MANAGE_OWN]),
  [ROLES.ADMIN]: new Set(Object.values(PERMISSIONS).filter((p) => !OWNER_ONLY.has(p))),
  [ROLES.SUPER_ADMIN]: new Set(Object.values(PERMISSIONS)),
});

const hasPermission = (role, permission) => Boolean(ROLE_PERMISSIONS[role]?.has(permission));

const isAdminRole = (role) => role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;

/**
 * Roles exempt from "one account, one authorized device".
 *
 * Staff work from wherever they happen to be — a phone between classes, a
 * laptop in the office, a lab machine — and locking them to one device turns
 * every device change into an account recovery. The rule exists to stop
 * students sharing one paid account, so it applies to students and to nobody
 * else.
 *
 * What is NOT relaxed, for any role: every session stays pinned to the device
 * that created it, so a stolen staff token is still refused from anywhere else.
 */
const isMultiDeviceRole = (role) =>
  role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN || role === ROLES.TEACHER;

/**
 * Whether this account may hold several authorized devices: the owner always,
 * plus anyone the owner has explicitly granted it. Takes the user document
 * rather than a role, because the grant is per account.
 */
const isMultiDeviceUser = (user) => isMultiDeviceRole(user?.role) || !!user?.allowMultipleDevices;

/**
 * May `actorRole` assign `targetRole` to another account?
 * super_admin is never assignable (bootstrap only); admin needs admins.create;
 * anything else must rank strictly below the actor.
 */
const canAssignRole = (actorRole, targetRole) => {
  if (targetRole === ROLES.SUPER_ADMIN) return false;
  if (targetRole === ROLES.ADMIN) return hasPermission(actorRole, PERMISSIONS.ADMINS_CREATE);
  if (!(targetRole in ROLE_RANK) || !(actorRole in ROLE_RANK)) return false;
  return ROLE_RANK[targetRole] < ROLE_RANK[actorRole];
};

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, ROLE_RANK, hasPermission, isAdminRole, isMultiDeviceRole, isMultiDeviceUser, canAssignRole };
