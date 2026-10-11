// In-app notifications (Req 5). Any feature that needs to tell a user something calls these helpers,
// e.g. after an advisor is assigned or a schedule is processed:
//   const { createNotification } = require('../services/inAppNotifications');
//   await createNotification(student._id, 'Your schedule has been processed.');
// (services/notificationService.js is a different thing: it e-mails advisors for Req 13.)
const Notification = require('../models/Notification');

async function createNotification(userId, message) {
  if (typeof userId !== 'string' || !userId) throw new Error('createNotification needs a user id');
  if (typeof message !== 'string' || !message.trim()) throw new Error('createNotification needs a message');
  return Notification.create({ user_id: userId, message });
}

// Same message to several users (e.g. every student in a group).
async function createNotifications(userIds, message) {
  return Promise.all([...new Set(userIds)].map((id) => createNotification(id, message)));
}

module.exports = { createNotification, createNotifications };
