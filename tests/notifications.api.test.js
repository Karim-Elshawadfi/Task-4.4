// End-to-end tests for Req 5 (in-app notifications) against an in-memory MongoDB.
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../app');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { createNotification, createNotifications } = require('../services/inAppNotifications');
const { createSessions } = require('./helpers/session');

const secret = 'notifications-test-secret-32-characters-min';
const app = createApp({ secret, sendResetEmail: async () => {} });
const { signIn, auth } = createSessions(secret);

let mongo, sara, omar, older, newer, others;

// Insert with an explicit created_at so ordering is deterministic.
const insert = async (userId, message, created_at, is_read = false) => {
  const _id = require('crypto').randomUUID();
  await Notification.collection.insertOne({ _id, user_id: userId, message, is_read, created_at });
  return _id;
};

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const base = { password_hash: 'x', role: 'STUDENT' };
  sara = await User.create({ ...base, full_name: 'Sara', guc_email: 'sara@student.guc.edu.eg' });
  omar = await User.create({ ...base, full_name: 'Omar', guc_email: 'omar@student.guc.edu.eg' });
  await Promise.all([sara, omar].map(signIn));
});

test.beforeEach(async () => {
  await Notification.deleteMany({});
  older = await insert(sara._id, 'Older message', new Date('2026-10-01T10:00:00Z'));
  newer = await insert(sara._id, 'Newer message', new Date('2026-10-02T10:00:00Z'));
  others = await insert(omar._id, 'Omar only', new Date('2026-10-03T10:00:00Z'));
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('requires a signed-in user', async () => {
  await request(app).get('/api/notifications').expect(401);
  await request(app).patch(`/api/notifications/${older}/read`).expect(401);
});

test('lists only my notifications, newest first, with an unread count', async () => {
  const { body } = await request(app).get('/api/notifications').set(auth(sara)).expect(200);
  assert.deepEqual(body.notifications.map((n) => n.message), ['Newer message', 'Older message']);
  assert.equal(body.unread_count, 2);
  assert.deepEqual(Object.keys(body.notifications[0]).sort(), ['created_at', 'is_read', 'message', 'notification_id']);
  assert.ok(body.notifications.every((n) => n.is_read === false));
});

test('marks one of my notifications as read', async () => {
  const { body } = await request(app).patch(`/api/notifications/${newer}/read`).set(auth(sara)).expect(200);
  assert.equal(body.notification_id, newer);
  assert.equal(body.is_read, true);
  const list = (await request(app).get('/api/notifications').set(auth(sara))).body;
  assert.equal(list.unread_count, 1);
  assert.equal(list.notifications.find((n) => n.notification_id === older).is_read, false);
  // Marking again is harmless.
  await request(app).patch(`/api/notifications/${newer}/read`).set(auth(sara)).expect(200);
});

test('cannot read or mark another user\'s notification', async () => {
  await request(app).patch(`/api/notifications/${others}/read`).set(auth(sara)).expect(404);
  assert.equal((await Notification.findById(others).lean()).is_read, false);
  const { body } = await request(app).get('/api/notifications').set(auth(sara));
  assert.ok(!body.notifications.some((n) => n.notification_id === others));
  await request(app).patch('/api/notifications/does-not-exist/read').set(auth(sara)).expect(404);
});

test('createNotification / createNotifications give other features a shared way to notify', async () => {
  const one = await createNotification(sara._id, 'Your schedule has been processed.');
  assert.equal(one.is_read, false);
  assert.ok(one.created_at instanceof Date);
  await createNotifications([sara._id, omar._id, omar._id], 'Group announcement');
  assert.equal(await Notification.countDocuments({ message: 'Group announcement' }), 2); // duplicates removed
  const { body } = await request(app).get('/api/notifications').set(auth(omar));
  assert.ok(body.notifications.some((n) => n.message === 'Group announcement'));
  await assert.rejects(() => createNotification('', 'x'));
  await assert.rejects(() => createNotification(sara._id, '   '));
});
