// End-to-end tests for Req 6-9 against an in-memory MongoDB.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../app');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const { hashCode } = require('../services/authSecurity');
const StudentProfile = require('../models/StudentProfile');
const WorkflowAction = require('../models/WorkflowAction');
const { recordWorkflowAction } = require('../services/workflowStatus');

const secret = 'students-test-secret-32-characters-minimum';
const app = createApp({ secret, sendResetEmail: async () => {} });
// Mint a token the same way POST /api/auth/login does, so `protect` accepts it.
const tokens = new Map();
const signIn = async (user) => {
  const session = await AuthSession.create({ user_id: user._id,
    credential_hash: hashCode(user._id, user.password_hash, secret), expires_at: new Date(Date.now() + 3600e3) });
  tokens.set(user._id, jwt.sign({ id: user._id }, secret,
    { algorithm: 'HS256', jwtid: session._id, expiresIn: '1h', issuer: 'guc-scheduling', audience: 'guc-scheduling' }));
};
const auth = (user) => ({ Authorization: `Bearer ${tokens.get(user._id)}` });

let mongo, coordinator, advisor, omar, nour, laila;

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const base = { password_hash: 'x' };
  coordinator = await User.create({ ...base, full_name: 'Rania Lotfy', guc_email: 'coordinator@guc.edu.eg', role: 'COORDINATOR' });
  advisor = await User.create({ ...base, full_name: 'Amr Hassan', guc_email: 'amr.hassan@guc.edu.eg', role: 'ADVISOR' });
  await Promise.all([signIn(coordinator), signIn(advisor)]);

  const student = async (full_name, profile, account_status = 'ACTIVE') => {
    const u = await User.create({ ...base, full_name, account_status, guc_email: `${full_name.toLowerCase().replace(' ', '.')}@student.guc.edu.eg`, role: 'STUDENT' });
    await StudentProfile.create({ _id: u._id, ...profile });
    return u;
  };
  omar = await student('Omar Khaled', { guc_student_id: '52-1001', student_type: 'ADVISING', major: 'CS', current_semester: 5, academic_standing: 'Probation', assigned_advisor_id: advisor._id });
  nour = await student('Nour Ahmed', { guc_student_id: '52-1002', student_type: 'ADVISING', major: 'DMET', current_semester: 3, assigned_advisor_id: advisor._id }, 'DEACTIVATED');
  laila = await student('Laila Mahmoud', { guc_student_id: '56-2001', student_type: 'NORMAL', major: 'CS', current_semester: 3 });

  await recordWorkflowAction(nour._id, 'DRAFT_CREATED', advisor._id);
  await recordWorkflowAction(nour._id, 'SENT_FOR_STUDENT_REVIEW', advisor._id);
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const list = (query = '') => request(app).get(`/api/students${query}`).set(auth(coordinator));

test('non-coordinators get 403', async () => {
  await request(app).get('/api/students').set(auth(advisor)).expect(403);
});

test('lists only students, newest update first, with derived status and blocking step', async () => {
  const { body } = await list().expect(200);
  assert.equal(body.total, 3);
  assert.equal(body.students[0].fullName, 'Nour Ahmed');
  assert.equal(body.students[0].workflowStatus, 'Ready for Student Review');
  assert.equal(body.students[0].blockingStep, 'Student review');
  assert.equal(body.students[0].assignedAdvisor.fullName, 'Amr Hassan');
  assert.equal(body.students[0].accountStatus, 'DEACTIVATED');
  assert.ok(!('password_hash' in body.students[0]));

  const omarRow = body.students.find((s) => s.id === omar._id);
  assert.equal(omarRow.workflowStatus, 'Not Started'); // no actions, no stored status
  const lailaRow = body.students.find((s) => s.id === laila._id);
  assert.equal(lailaRow.workflowStatus, 'Schedule Assigned');
  assert.equal(lailaRow.assignedAdvisor, null);
});

test('search hits users.full_name, users.guc_email and guc_student_id', async () => {
  assert.equal((await list('?search=khaled')).body.students[0].id, omar._id);
  assert.equal((await list('?search=laila.m')).body.students[0].id, laila._id);
  assert.deepEqual((await list('?search=52-')).body.students.map((s) => s.id).sort(), [omar._id, nour._id].sort());
});

test('filters, including derived blocking step and pagination', async () => {
  assert.equal((await list('?studentType=NORMAL')).body.total, 1);
  assert.equal((await list(`?advisor=${advisor._id}&semester=5`)).body.students[0].id, omar._id);
  assert.equal((await list('?advisor=none')).body.students[0].id, laila._id);
  assert.equal((await list('?accountStatus=DEACTIVATED')).body.students[0].id, nour._id);
  assert.equal((await list('?blockingStep=Advisor%20drafting%20schedule')).body.students[0].id, omar._id);
  assert.equal((await list('?status=Not%20Started')).body.total, 1);
  const page2 = (await list('?sort=name&limit=2&page=2')).body;
  assert.deepEqual([page2.total, page2.totalPages, page2.students[0].fullName], [3, 2, 'Omar Khaled']);
});

test('filter options come from the data', async () => {
  const { body } = await request(app).get('/api/students/filter-options').set(auth(coordinator)).expect(200);
  assert.deepEqual(body.advisors, [{ value: advisor._id, label: 'Amr Hassan', email: 'amr.hassan@guc.edu.eg' }]);
  assert.deepEqual(body.majors, ['CS', 'DMET']);
  assert.deepEqual(body.semesters, [3, 5]);
  assert.deepEqual(body.standings, ['Probation']);
});

test('details include workflow history; non-students and bad ids are rejected', async () => {
  const { body } = await request(app).get(`/api/students/${nour._id}`).set(auth(coordinator)).expect(200);
  assert.equal(body.student.studentId, '52-1002');
  assert.deepEqual(body.history.map((h) => h.type), ['SENT_FOR_STUDENT_REVIEW', 'DRAFT_CREATED']);
  assert.deepEqual(body.history[0].performedBy, { fullName: 'Amr Hassan', role: 'ADVISOR' });
  assert.equal(await WorkflowAction.countDocuments({ student_id: nour._id }), 2);

  await request(app).get(`/api/students/${advisor._id}`).set(auth(coordinator)).expect(404);
  await request(app).get('/api/students/not-a-uuid').set(auth(coordinator)).expect(400);
});
