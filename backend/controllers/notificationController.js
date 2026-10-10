const NotificationModel = require('../models/notificationModel');

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const notifications = await NotificationModel.findByUserId(req.user.user_id);
    res.json(notifications);
  } catch (err) {
    console.error('getNotifications error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

// PATCH /api/notifications/:id/read
const markNotificationRead = async (req, res) => {
  try {
    const updated = await NotificationModel.markAsRead(req.params.id, req.user.user_id);
    if (!updated) return res.status(404).json({ message: 'Notification not found.' });
    res.json(updated);
  } catch (err) {
    // 22P02 = invalid_text_representation (malformed id for the column type)
    if (err.code === '22P02') return res.status(400).json({ message: 'Invalid notification id.' });
    console.error('markNotificationRead error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = { getNotifications, markNotificationRead };
