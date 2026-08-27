const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../core/asyncHandler');
const { validate, paginationSchema } = require('../../middleware/validate');
const { NotificationService } = require('./notifications.service');

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

module.exports = router;
