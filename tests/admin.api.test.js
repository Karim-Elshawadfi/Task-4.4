// End-to-end tests for Req 10 (activate / deactivate accounts) against an in-memory MongoDB, using real login.
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../app');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const StudentProfile = require('../models/StudentProfile');
const WorkflowAction = require('../models/WorkflowAction');
const { recordWorkflowAction } = require('../services/workflowStatus');
const { createSessions } = require('./helpers/session');

const secret = 'admin-test-secret-32-characters-minimum-ok';
const app = createApp({ secret, sendResetEmail: async () => {} });
const { signIn, auth } = createSessions(secret);
const PASSWORD = 'Password123!';

let mongo, admin, advisor, sara;

const setStatus = (actor, id, body) => request(app).patch(`/api/admin/users/${id}/status`).set(auth(actor)).send(body);
const login = (email) => request(app).post('/api/auth/login').send({ email, password: PASSWORD });

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const base = { password_hash: bcrypt.hashSync(PASSWORD, 4) };
  admin = await User.create({ ...base, full_name: 'Ahmed Saeed', guc_email: 'admin@guc.edu.eg', role: 'ADMIN' });
  advisor = await User.create({ ...base, full_name: 'Amr Hassan', guc_email: 'amr.hassan@guc.edu.eg', role: 'ADVISOR' });
  sara = await User.create({ ...base, full_name: 'Sara Ibrahim', guc_email: 'sara.ibrahim@student.guc.edu.eg', role: 'STUDENT' });
  await StudentProfile.create({ _id: sara._id, guc_student_id: '56-2001', student_type: 'ADVISING', major: 'CS', current_semester: 5 });
  await recordWorkflowAction(sara._id, 'DRAFT_CREATED', advisor._id);
  await Promise.all([admin, advisor, sara].map(signIn));
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('only administrators can use the admin endpoints', async () => {
  await request(app).get('/api/admin/users').expect(401);
  await request(app).get('/api/admin/users').set(auth(advisor)).expect(403);
  await setStatus(advisor, sara._id, { account_status: 'DEACTIVATED' }).expect(403);
  await setStatus(sara, sara._id, { account_status: 'DEACTIVATED' }).expect(403);
  assert.equal((await User.findById(sara._id).lean()).account_status, 'ACTIVE');
});

test('lists and searches users without exposing secrets', async () => {
  const all = (await request(app).get('/api/admin/users').set(auth(admin)).expect(200)).body;
  assert.equal(all.total, 3);
  assert.deepEqual(all.users.map((u) => u.full_name), ['Ahmed Saeed', 'Amr Hassan', 'Sara Ibrahim']);
  assert.ok(!JSON.stringify(all).includes('password'));
  const found = (await request(app).get('/api/admin/users?search=sara.ib').set(auth(admin))).body;
  assert.deepEqual(found.users.map((u) => u.user_id), [sara._id]);
  assert.equal((await request(app).get('/api/admin/users?search=.*').set(auth(admin))).body.total, 0); // regex is escaped
});

test('rejects bad input, self-deactivation and unknown users', async () => {
  await setStatus(admin, sara._id, { account_status: 'DELETED' }).expect(400);
  await setStatus(admin, sara._id, {}).expect(400);
  await setStatus(admin, admin._id, { account_status: 'DEACTIVATED' }).expect(400);
  assert.equal((await User.findById(admin._id).lean()).account_status, 'ACTIVE');
  await setStatus(admin, 'no-such-user', { account_status: 'DEACTIVATED' }).expect(404);
});

test('deactivation blocks login and open sessions but keeps every academic record; reactivation restores access', async () => {
  await login(sara.guc_email).expect(200);
  await request(app).get('/api/users/profile').set(auth(sara)).expect(200);

  const off = (await setStatus(admin, sara._id, { account_status: 'DEACTIVATED' }).expect(200)).body;
  assert.equal(off.account_status, 'DEACTIVATED');
  assert.ok(!('password_hash' in off));

  await login(sara.guc_email).expect(401);
  await request(app).get('/api/users/profile').set(auth(sara)).expect(401);
  assert.equal(await AuthSession.countDocuments({ user_id: sara._id }), 0);

  // Nothing was deleted.
  assert.ok(await User.findById(sara._id).lean());
  assert.equal((await StudentProfile.findById(sara._id).lean()).guc_student_id, '56-2001');
  assert.equal(await WorkflowAction.countDocuments({ student_id: sara._id }), 1);

  const on = (await setStatus(admin, sara._id, { account_status: 'ACTIVE' }).expect(200)).body;
  assert.equal(on.account_status, 'ACTIVE');
  await request(app).get('/api/users/profile').set(auth(sara)).expect(401); // the old session stays revoked
  await login(sara.guc_email).expect(200);
});
