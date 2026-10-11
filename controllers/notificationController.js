// Req 5: a signed-in user views their own notifications (newest first) and marks them as read.
const Notification = require('../models/Notification');
const { HttpError } = require('../services/httpError');

const toDto = (n) => ({ notification_id: n._id, message: n.message, is_read: n.is_read, created_at: n.created_at });

// GET /api/notifications
async function listNotifications(req, res) {
  const rows = await Notification.find({ user_id: req.user._id })
    .sort({ created_at: -1, _id: -1 }).limit(200).lean();
  res.json({
    notifications: rows.map(toDto),
    unread_count: await Notification.countDocuments({ user_id: req.user._id, is_read: false }),
  });
}

// PATCH /api/notifications/:id/read
async function markNotificationRead(req, res) {
  // The owner is part of the filter, so another user's notification looks like "not found".
  const updated = await Notification.findOneAndUpdate(
    { _id: req.params.id, user_id: req.user._id },
    { $set: { is_read: true } },
    { returnDocument: 'after' }
  ).lean();
  if (!updated) throw new HttpError(404, 'Notification not found.');
  res.json(toDto(updated));
}

module.exports = { listNotifications, markNotificationRead };
