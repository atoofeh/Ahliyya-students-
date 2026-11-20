const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../core/asyncHandler');
const { validate, paginationSchema } = require('../../middleware/validate');
const { NotificationService } = require('./notifications.service');

// An FCM registration token. Long, opaque, and worth bounding so a bad client
// cannot store arbitrary text against an account.
const pushTokenSchema = z.object({
  token: z.string().min(20).max(4096).trim(),
  platform: z.enum(['android', 'ios', 'web']).optional(),
});

const listQuery = paginationSchema.extend({
  unreadOnly: z.coerce.boolean().optional().default(false),
});

router.use(authenticate);

router.get('/', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await NotificationService.list(req.user.id, req.query));
}));
router.get('/unread-count', asyncHandler(async (req, res) => {
  res.json({ count: await NotificationService.unreadCount(req.user.id) });
}));
router.post('/:id/read', asyncHandler(async (req, res) => {
  await NotificationService.markRead(req.user.id, req.params.id);
  res.json({ message: 'Marked read' });
}));
router.post('/read-all', asyncHandler(async (req, res) => {
  await NotificationService.markAllRead(req.user.id);
  res.json({ message: 'All marked read' });
}));

/**
 * Register this phone for notifications that arrive while the app is closed.
 *
 * The token is Firebase's delivery address for one app installation. Claiming
 * a token that another account registered moves it, rather than duplicating
 * it: the same phone signed into a different account must not keep receiving
 * the previous person's notifications.
 */
router.post('/push-token', validate(pushTokenSchema), asyncHandler(async (req, res) => {
  const PushToken = require('../../models/PushToken');
  await PushToken.findOneAndUpdate(
    { token: req.body.token },
    {
      $set: {
        user: req.user.id,
        platform: req.body.platform || 'android',
        deviceId: req.get('x-device-id') || null,
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
  res.status(201).json({ message: 'This device will receive notifications' });
}));

/** Stop pushing to this phone — on sign-out, or when the user turns it off. */
router.delete('/push-token', validate(pushTokenSchema), asyncHandler(async (req, res) => {
  const PushToken = require('../../models/PushToken');
  await PushToken.deleteOne({ token: req.body.token, user: req.user.id });
  res.json({ message: 'This device will no longer receive notifications' });
}));

module.exports = router;
