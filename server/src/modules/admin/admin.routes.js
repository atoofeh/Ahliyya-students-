const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const asyncHandler = require('../../core/asyncHandler');
const { validate, paginationSchema, objectId } = require('../../middleware/validate');
const { passwordRule } = require('../auth/auth.validators');
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
  role: z.enum(['admin', 'teacher', 'student']).optional(),
  status: z.enum(['active', 'suspended', 'banned', 'pending']).optional(),
});

const auditQuery = paginationSchema.extend({
  action: z.string().max(50).optional(),
  userId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

router.use(authenticate, authorize('admin'));

// Users
router.post('/users', validate(createUserSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await AdminService.createUser(req.user.id, req.body, req.ip));
}));
router.get('/users', validate(userListQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await AdminService.listUsers(req.query));
}));
router.get('/users/:userId', asyncHandler(async (req, res) => {
  res.json(await AdminService.getUserDetail(req.params.userId));
}));
router.put('/users/:userId', validate(updateUserSchema), asyncHandler(async (req, res) => {
  res.json(await AdminService.updateUser(req.user.id, req.params.userId, req.body, req.ip));
}));
router.post('/users/:userId/status', validate(statusSchema), asyncHandler(async (req, res) => {
  res.json(await AdminService.setUserStatus(req.user.id, req.params.userId, req.body.status, req.ip));
}));
router.post('/users/:userId/reset-password', validate(resetPasswordSchema), asyncHandler(async (req, res) => {
  res.json(await AdminService.resetUserPassword(req.user.id, req.params.userId, req.body.password, req.ip));
}));
router.post('/users/:userId/force-logout', asyncHandler(async (req, res) => {
  res.json(await AdminService.forceLogoutUser(req.user.id, req.params.userId, req.ip));
}));
router.delete('/users/:userId', asyncHandler(async (req, res) => {
  await AdminService.deleteUser(req.user.id, req.params.userId, req.ip);
  res.json({ message: 'User deleted' });
}));

// Sessions
router.get('/sessions', validate(paginationSchema, 'query'), asyncHandler(async (req, res) => {
  res.json(await AdminService.listActiveSessions(req.query));
}));
router.post('/sessions/:sessionId/terminate', asyncHandler(async (req, res) => {
  res.json(await AdminService.forceLogout(req.user.id, req.params.sessionId, req.ip));
}));

// Settings
router.get('/settings', asyncHandler(async (req, res) => {
  res.json(await AdminService.getPlatformSettings());
}));
router.put('/settings', validate(settingsSchema), asyncHandler(async (req, res) => {
  res.json(await AdminService.updateSettings(req.user.id, req.body, req.ip));
}));

// Logs
router.get('/audit-logs', validate(auditQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await AdminService.auditLogs(req.query));
}));
router.get('/login-history', validate(paginationSchema.extend({ success: z.coerce.boolean().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    res.json(await AdminService.loginHistory(req.query));
  }));

module.exports = router;
