// Table `notifications` from the Sprint 1 unified schema (Req 5, owned by Person 2).
// PK `notification_id` (UUID) is stored as Mongo `_id`, like the other models.
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const notificationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() }, // notification_id
    user_id: { type: String, ref: 'User', required: true }, // recipient -> users.user_id
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    is_read: { type: Boolean, default: false },
  },
  { collection: 'notifications', timestamps: { createdAt: 'created_at', updatedAt: false } }
);

notificationSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
