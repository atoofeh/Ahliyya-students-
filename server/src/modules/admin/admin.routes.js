const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const { requirePermission } = require('../../middleware/authorize');
const asyncHandler = require('../../core/asyncHandler');
const { validate, paginationSchema, objectId } = require('../../middleware/validate');
const { passwordRule } = require('../auth/auth.validators');
const { PERMISSIONS: P } = require('../../core/permissions');
const AdminService = require('./admin.service');

const createUserSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  username: z.string().min(3).max(50).trim().toLowerCase()
    .regex(/^[a-z0-9_.-]+$/, 'Username may contain letters, numbers, dots, dashes, underscores'),
  email: z.string().email().max(200).optional(),
  password: passwordRule,
  role: z.enum(['admin', 'teacher', 'student']),
  mustChangePassword: z.boolean().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  email: z.string().email().max(200).nullable().optional(),
  role: z.enum(['admin', 'teacher', 'student']).optional(),
});

const statusSchema = z.object({ status: z.enum(['active', 'suspended', 'banned']) });
const resetPasswordSchema = z.object({ password: passwordRule });
const settingsSchema = z.record(z.string(), z.any());

const userListQuery = paginationSchema.extend({
  role: z.enum(['super_admin', 'admin', 'teacher', 'student']).optional(),
  status: z.enum(['active', 'suspended', 'banned', 'pending']).optional(),
});

const auditQuery = paginationSchema.extend({
  action: z.string().max(50).optional(),
  userId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

router.use(authenticate);

// Users
router.post('/users', requirePermission(P.USERS_CREATE), validate(createUserSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await AdminService.createUser(req.user, req.body, req.ip));
}));
router.get('/users', requirePermission(P.USERS_VIEW), validate(userListQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await AdminService.listUsers(req.query));
}));
router.get('/users/:userId', requirePermission(P.USERS_VIEW), asyncHandler(async (req, res) => {
  res.json(await AdminService.getUserDetail(req.params.userId));
}));
router.put('/users/:userId', requirePermission(P.USERS_UPDATE), validate(updateUserSchema), asyncHandler(async (req, res) => {
  res.json(await AdminService.updateUser(req.user, req.params.userId, req.body, req.ip));
}));
router.post('/users/:userId/status', requirePermission(P.USERS_SUSPEND), validate(statusSchema), asyncHandler(async (req, res) => {
  res.json(await AdminService.setUserStatus(req.user, req.params.userId, req.body.status, req.ip));
}));
router.post('/users/:userId/reset-password', requirePermission(P.USERS_RESET_PASSWORD), validate(resetPasswordSchema), asyncHandler(async (req, res) => {
  res.json(await AdminService.resetUserPassword(req.user, req.params.userId, req.body.password, req.ip));
}));
router.post('/users/:userId/force-logout', requirePermission(P.USERS_FORCE_LOGOUT), asyncHandler(async (req, res) => {
  res.json(await AdminService.forceLogoutUser(req.user, req.params.userId, req.ip));
}));
router.delete('/users/:userId', requirePermission(P.USERS_DELETE), asyncHandler(async (req, res) => {
  await AdminService.deleteUser(req.user, req.params.userId, req.ip);
  res.json({ message: 'User deleted' });
}));

// Authorized devices
const revokeDeviceSchema = z.object({ reason: z.string().trim().min(3).max(300) });

router.get('/users/:userId/device', requirePermission(P.DEVICES_VIEW), asyncHandler(async (req, res) => {
  res.json(await AdminService.getUserDevice(req.params.userId));
}));
router.post('/users/:userId/device/revoke', requirePermission(P.DEVICES_RESET), validate(revokeDeviceSchema), asyncHandler(async (req, res) => {
  res.json(await AdminService.revokeUserDevice(req.user, req.params.userId, req.body.reason, req.ip));
}));

// Sessions
router.get('/sessions', requirePermission(P.SESSIONS_VIEW), validate(paginationSchema, 'query'), asyncHandler(async (req, res) => {
  res.json(await AdminService.listActiveSessions(req.query));
}));
router.post('/sessions/:sessionId/terminate', requirePermission(P.SESSIONS_REVOKE), asyncHandler(async (req, res) => {
  res.json(await AdminService.forceLogout(req.user, req.params.sessionId, req.ip));
}));

// Settings
router.get('/settings', requirePermission(P.SETTINGS_VIEW), asyncHandler(async (req, res) => {
  res.json(await AdminService.getPlatformSettings());
}));
router.put('/settings', requirePermission(P.SETTINGS_MANAGE), validate(settingsSchema), asyncHandler(async (req, res) => {
  res.json(await AdminService.updateSettings(req.user, req.body, req.ip));
}));

// Logs
router.get('/audit-logs', requirePermission(P.AUDIT_VIEW), validate(auditQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await AdminService.auditLogs(req.query));
}));
router.get('/login-history', requirePermission(P.LOGIN_HISTORY_VIEW),
  validate(paginationSchema.extend({ success: z.coerce.boolean().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    res.json(await AdminService.loginHistory(req.query));
  }));

module.exports = router;
