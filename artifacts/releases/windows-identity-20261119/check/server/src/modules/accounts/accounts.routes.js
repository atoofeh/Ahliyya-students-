const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../core/asyncHandler');
const audit = require('../../core/audit');
const { validate } = require('../../middleware/validate');
const AccountDeletionRequest = require('../../models/AccountDeletionRequest');
const User = require('../../models/User');
const { notifyUser } = require('../notifications/notifications.service');

const deletionRequestSchema = z.object({ reason: z.string().max(1000).trim().optional() });

router.use(authenticate);

router.get('/deletion-request', asyncHandler(async (req, res) => {
  const request = await AccountDeletionRequest.findOne({ user: req.user.id })
    .sort({ createdAt: -1 }).lean();
  res.json({ request });
}));

router.post('/deletion-request', validate(deletionRequestSchema), asyncHandler(async (req, res) => {
  let request = await AccountDeletionRequest.findOne({ user: req.user.id, status: 'open' });
  let created = false;
  if (!request) {
    try {
      request = await AccountDeletionRequest.create({ user: req.user.id, reason: req.body.reason || '' });
      created = true;
    } catch (err) {
      if (err.code !== 11000) throw err;
      request = await AccountDeletionRequest.findOne({ user: req.user.id, status: 'open' });
    }
  }

  if (created) {
    await audit({ user: req.user.id, action: 'ACCOUNT_DELETION_REQUESTED', ip: req.ip, resource: `account-deletion:${request._id}` });
    const admins = await User.find({
      role: { $in: ['admin', 'super_admin'] }, status: 'active', deletedAt: null,
    }).select('_id');
    for (const admin of admins) {
      await notifyUser(admin._id, {
        type: 'system',
        title: 'Account deletion request',
        body: `${req.user.name || 'A user'} requested account deletion.`,
        link: '/admin/users',
      });
    }
  }

  res.status(created ? 201 : 200).json({ request, existing: !created });
}));

module.exports = router;
