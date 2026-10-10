const pool = require('../config/db');

const NotificationModel = {
  async findByUserId(userId) {
    const { rows } = await pool.query(
      `SELECT notification_id, user_id, message, is_read, created_at
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  },

  /** Scoped by user_id so nobody can mark someone else's notification. */
  async markAsRead(notificationId, userId) {
    const { rows } = await pool.query(
      `UPDATE notifications
          SET is_read = TRUE
        WHERE notification_id = $1 AND user_id = $2
        RETURNING notification_id, user_id, message, is_read, created_at`,
      [notificationId, userId]
    );
    return rows[0] || null;
  },
};

module.exports = NotificationModel;
