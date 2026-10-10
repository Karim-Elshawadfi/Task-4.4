// End-to-end tests for Req 4 (profile viewing) against an in-memory MongoDB.
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../app');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const { recordWorkflowAction } = require('../services/workflowStatus');
const { createSessions } = require('./helpers/session');

const secret = 'profile-test-secret-32-characters-minimum';
const app = createApp({ secret, sendResetEmail: async () => {} });
const { signIn, auth } = createSessions(secret);

let mongo, advisor, omar, laila, coordinator;

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const base = { password_hash: 'x' };
  advisor = await User.create({ ...base, full_name: 'Amr Hassan', guc_email: 'amr.hassan@guc.edu.eg', role: 'ADVISOR' });
  coordinator = await User.create({ ...base, full_name: 'Rania Lotfy', guc_email: 'coordinator@guc.edu.eg', role: 'COORDINATOR' });
  omar = await User.create({ ...base, full_name: 'Omar Khaled', guc_email: 'omar.khaled@student.guc.edu.eg', role: 'STUDENT' });
  laila = await User.create({ ...base, full_name: 'Laila Mahmoud', guc_email: 'laila.mahmoud@student.guc.edu.eg', role: 'STUDENT' });
  await StudentProfile.create({ _id: omar._id, guc_student_id: '52-1001', student_type: 'ADVISING', major: 'CS',
    current_semester: 5, academic_standing: 'Probation', assigned_advisor_id: advisor._id, workflow_status: 'Processed' });
  await StudentProfile.create({ _id: laila._id, guc_student_id: '56-2001', student_type: 'NORMAL', major: 'DMET', current_semester: 3 });
  await recordWorkflowAction(omar._id, 'DRAFT_CREATED', advisor._id);
  // Make the cached column stale on purpose: the profile must use the calculated status, not this value.
  await StudentProfile.updateOne({ _id: omar._id }, { $set: { workflow_status: 'Processed' } });
  await Promise.all([advisor, coordinator, omar, laila].map(signIn));
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const profile = (user) => request(app).get('/api/users/profile').set(auth(user));

test('requires a signed-in user', async () => {
  await request(app).get('/api/users/profile').expect(401);
});

test('advising student sees academic details, advisor and the calculated schedule status', async () => {
  const { body } = await profile(omar).expect(200);
  assert.equal(body.user_id, omar._id);
  assert.equal(body.full_name, 'Omar Khaled');
  assert.equal(body.guc_email, 'omar.khaled@student.guc.edu.eg');
  assert.equal(body.role, 'STUDENT');
  assert.deepEqual(body.student_profile, {
    guc_student_id: '52-1001', student_type: 'ADVISING', major: 'CS', current_semester: 5,
    academic_standing: 'Probation',
    assigned_advisor: { full_name: 'Amr Hassan', guc_email: 'amr.hassan@guc.edu.eg' },
    schedule_status: 'Draft', // calculated from workflow actions, not the stale stored 'Processed'
  });
});

test('normal student has no advisor and the default status', async () => {
  const { body } = await profile(laila).expect(200);
  assert.equal(body.student_profile.student_type, 'NORMAL');
  assert.equal(body.student_profile.assigned_advisor, null);
  assert.equal(body.student_profile.schedule_status, 'Schedule Assigned');
});

test('staff see only name, email and role', async () => {
  for (const [user, role] of [[advisor, 'ADVISOR'], [coordinator, 'COORDINATOR']]) {
    const { body } = await profile(user).expect(200);
    assert.deepEqual(Object.keys(body).sort(), ['full_name', 'guc_email', 'role', 'user_id']);
    assert.equal(body.role, role);
  }
});

test('never exposes secrets and always returns the caller\'s own profile', async () => {
  const { body } = await profile(laila).expect(200);
  assert.equal(body.user_id, laila._id);
  assert.ok(!JSON.stringify(body).includes('password'));
  // The endpoint takes no id: a query/param cannot select another user's profile.
  const other = await request(app).get(`/api/users/profile?user_id=${omar._id}`).set(auth(laila)).expect(200);
  assert.equal(other.body.user_id, laila._id);
});
