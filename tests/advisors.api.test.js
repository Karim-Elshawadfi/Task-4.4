// End-to-end tests for Person 4 (Req 11-15, 57, 58, 61) against an in-memory MongoDB.
// Run: node --test tests/advisors.api.test.js
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../app');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const StudentProfile = require('../models/StudentProfile');
const WorkflowAction = require('../models/WorkflowAction');
const AdvisorAssignment = require('../models/AdvisorAssignment');
const SchedulingPreference = require('../models/SchedulingPreference');
const AcademicRecord = require('../models/AcademicRecord');
const AcademicTerm = require('../models/AcademicTerm');
const { hashCode } = require('../services/authSecurity');
const { advisorEmailContent } = require('../services/notificationService');

const secret = 'advisors-test-secret-32-characters-minimum';
const sent = []; // every advisor email the app "sends"
const app = createApp({ secret, sendResetEmail: async () => {}, sendAdvisorEmail: async (m) => { sent.push(m); } });
const tokens = new Map();
const signIn = async (user) => {
  const session = await AuthSession.create({ user_id: user._id,
    credential_hash: hashCode(user._id, user.password_hash, secret), expires_at: new Date(Date.now() + 3600e3) });
  tokens.set(user._id, jwt.sign({ id: user._id }, secret,
    { algorithm: 'HS256', jwtid: session._id, expiresIn: '1h', issuer: 'guc-scheduling', audience: 'guc-scheduling' }));
};
const as = (user) => ({ Authorization: `Bearer ${tokens.get(user._id)}` });

let mongo, coordinator, amr, sara, removedAdvisor, deactivatedAdvisor, omar, nour, laila, mona, term;
const DAY = 24 * 3600e3;

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const base = { password_hash: 'x' };
  const staff = (full_name, guc_email, role, extra = {}) => User.create({ ...base, full_name, guc_email, role, ...extra });
  coordinator = await staff('Rania Lotfy', 'coordinator@guc.edu.eg', 'COORDINATOR');
  amr = await staff('Amr Hassan', 'amr.hassan@guc.edu.eg', 'ADVISOR');
  sara = await staff('Sara Adel', 'sara.adel@guc.edu.eg', 'ADVISOR');
  removedAdvisor = await staff('Hany Samir', 'hany.samir@guc.edu.eg', 'ADVISOR', { advising_active: false });
  deactivatedAdvisor = await staff('Dina Fawzy', 'dina.fawzy@guc.edu.eg', 'ADVISOR', { account_status: 'DEACTIVATED' });

  const student = async (full_name, profile) => {
    const u = await User.create({ ...base, full_name, guc_email: `${full_name.toLowerCase().replace(' ', '.')}@student.guc.edu.eg`, role: 'STUDENT' });
    await StudentProfile.create({ _id: u._id, ...profile });
    return u;
  };
  omar = await student('Omar Khaled', { guc_student_id: '52-1001', student_type: 'ADVISING', major: 'CS', current_semester: 5 });
  nour = await student('Nour Ahmed', { guc_student_id: '52-1002', student_type: 'ADVISING', major: 'DMET', current_semester: 3 });
  laila = await student('Laila Mahmoud', { guc_student_id: '56-2001', student_type: 'NORMAL', major: 'CS', current_semester: 3 });
  mona = await student('Mona Said', { guc_student_id: '52-1003', student_type: 'ADVISING', major: 'CS', current_semester: 7, assigned_advisor_id: sara._id });

  const now = Date.now();
  term = await AcademicTerm.create({ academic_year: '2026/2027', season: 'WINTER', name: 'Winter 2026/2027',
    term_start: new Date(now - 30 * DAY), term_end: new Date(now + 90 * DAY),
    teaching_start: new Date(now - 20 * DAY), teaching_end: new Date(now + 80 * DAY),
    advising_deadline: new Date(now + 10 * DAY), swap_deadline: new Date(now + 20 * DAY) });

  await Promise.all([coordinator, amr, sara, omar, nour, laila, mona].map(signIn));
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

// ---------------------------------------------------------------- access control
test('every route needs a login, and the right role', async () => {
  await request(app).get('/api/advisors').expect(401);
  await request(app).get('/api/advisors/my-advisor').expect(401);
  await request(app).put('/api/academic/preferences').send({ preferences: [] }).expect(401);

  for (const who of [amr, omar]) { // Req 11, 12, 14 are Coordinator-only
    await request(app).get('/api/advisors').set(as(who)).expect(403);
    await request(app).post('/api/advisors/add').set(as(who)).send({ guc_email: sara.guc_email }).expect(403);
    await request(app).delete(`/api/advisors/remove/${sara.guc_email}`).set(as(who)).expect(403);
    await request(app).post('/api/advisors/assign').set(as(who)).send({ studentId: omar._id, advisorId: amr._id }).expect(403);
  }
  await request(app).get('/api/advisors/my-advisor').set(as(coordinator)).expect(403); // Req 15 is Student-only
  await request(app).put('/api/academic/preferences').set(as(amr)).send({ preferences: [] }).expect(403);
  await request(app).get(`/api/academic/preferences/${omar._id}`).set(as(omar)).expect(403);
});

test('a forged role header grants nothing', async () => {
  await request(app).post('/api/advisors/add').set('x-user-role', 'COORDINATOR').send({ guc_email: sara.guc_email }).expect(401);
});

// ---------------------------------------------------------------- Req 11
test('Req 11: add an advisor by GUC email shows the full name; bad emails are rejected', async () => {
  const add = (guc_email) => request(app).post('/api/advisors/add').set(as(coordinator)).send({ guc_email });
  await add('').expect(400);
  await add('not-an-email').expect(400);
  await add('omar.khaled@student.guc.edu.eg').expect(400); // student domain
  await add('nobody@guc.edu.eg').expect(404);
  await add(coordinator.guc_email).expect(404); // exists, but is not an advisor
  await add(deactivatedAdvisor.guc_email).expect(409);

  sent.length = 0;
  const { body } = await add('  HANY.Samir@GUC.edu.eg ').expect(200); // trimmed + case-insensitive
  assert.equal(body.advisor.full_name, 'Hany Samir');
  assert.equal(body.email_sent, true);
  assert.ok(!JSON.stringify(body).includes('password_hash'));
  assert.equal((await User.findById(removedAdvisor._id)).advising_active, true);

  const again = await add(removedAdvisor.guc_email).expect(200); // idempotent, no second email
  assert.equal(again.body.already_active, true);
  assert.equal(again.body.advisor.full_name, 'Hany Samir');
  assert.equal(sent.length, 1);
});

test('Req 11: the advisor list shows who is in the advising system', async () => {
  const { body } = await request(app).get('/api/advisors').set(as(coordinator)).expect(200);
  assert.deepEqual(body.map((a) => a.full_name), ['Amr Hassan', 'Dina Fawzy', 'Hany Samir', 'Sara Adel']);
  assert.ok(body.every((a) => !('password_hash' in a)));
});

// ---------------------------------------------------------------- Req 14 + 15
test('Req 14: assign, reassign and keep the advisor history', async () => {
  const assign = (body) => request(app).post('/api/advisors/assign').set(as(coordinator)).send(body);
  await assign({}).expect(400);
  await assign({ studentId: 'nope', advisorId: amr._id }).expect(404);
  await assign({ studentId: laila._id, advisorId: amr._id }).expect(400); // Normal Student
  await assign({ studentId: omar._id, advisorId: omar._id }).expect(404); // not an advisor
  await assign({ studentId: omar._id, advisorId: deactivatedAdvisor._id }).expect(400);

  const first = await assign({ studentId: omar._id, advisorId: amr._id }).expect(200);
  assert.equal(first.body.message, 'Advisor assigned.');
  assert.equal((await StudentProfile.findById(omar._id)).assigned_advisor_id, amr._id);
  await assign({ studentId: omar._id, advisorId: amr._id }).expect(409); // same advisor again

  await new Promise((r) => setTimeout(r, 10)); // distinct timestamps for the history order
  // reassign by GUC student ID + advisor email
  const second = await assign({ guc_student_id: '52-1001', advisor_email: sara.guc_email }).expect(200);
  assert.equal(second.body.message, 'Advisor reassigned.');
  assert.equal(second.body.previous_advisor_id, amr._id);
  assert.equal((await StudentProfile.findById(omar._id)).assigned_advisor_id, sara._id);

  const history = await AdvisorAssignment.find({ student_id: omar._id }).sort({ assigned_at: 1 }).lean();
  assert.equal(history.length, 2); // nothing deleted
  assert.deepEqual(history.map((h) => h.advisor_id), [amr._id, sara._id]);
  assert.ok(history[0].removed_at && history[1].removed_at === null);
  assert.equal(history[1].assigned_by, coordinator._id);
});

test('Req 15: a student sees only their own advisor (name and email)', async () => {
  const { body } = await request(app).get('/api/advisors/my-advisor').set(as(omar)).expect(200);
  assert.deepEqual(body, { advisorName: 'Sara Adel', advisorEmail: 'sara.adel@guc.edu.eg' });
  await request(app).get('/api/advisors/my-advisor').set(as(nour)).expect(404); // none assigned yet
  await request(app).get('/api/advisors/my-advisor').set(as(laila)).expect(403); // Normal Student
  await request(app).get(`/api/advisors/my-advisor/${omar._id}`).set(as(nour)).expect(404); // no id in the URL any more
});

// ---------------------------------------------------------------- Req 12 + 13
test('Req 12 + 13: remove an advisor by email, keep the account and history, send the email', async () => {
  await WorkflowAction.create({ student_id: omar._id, action_type: 'DRAFT_CREATED', performed_by: sara._id });
  sent.length = 0;
  await request(app).delete('/api/advisors/remove/nobody@guc.edu.eg').set(as(coordinator)).expect(404);
  await request(app).delete(`/api/advisors/remove/${mona.guc_email}`).set(as(coordinator)).expect(400); // not a staff email

  const { body } = await request(app).delete(`/api/advisors/remove/${sara.guc_email}`).set(as(coordinator)).expect(200);
  assert.equal(body.unassigned_students, 2); // Omar and Mona
  assert.equal(body.email_sent, true);

  const stored = await User.findById(sara._id);
  assert.equal(stored.role, 'ADVISOR'); // not demoted
  assert.equal(stored.account_status, 'ACTIVE'); // not deactivated (that is Req 10)
  assert.equal(stored.advising_active, false);
  assert.equal((await StudentProfile.findById(omar._id)).assigned_advisor_id, null);
  assert.equal(await AdvisorAssignment.countDocuments({ advisor_id: sara._id, removed_at: null }), 0);
  assert.equal(await WorkflowAction.countDocuments({ performed_by: sara._id }), 1); // activity history kept

  assert.deepEqual(sent.map((m) => [m.email, m.action, m.full_name]), [[sara.guc_email, 'REMOVED', 'Sara Adel']]);
  await request(app).delete(`/api/advisors/remove/${sara.guc_email}`).set(as(coordinator)).expect(409);
  await request(app).post('/api/advisors/assign').set(as(coordinator)).send({ studentId: nour._id, advisorId: sara._id }).expect(400);

  // the student now has no advisor
  await request(app).get('/api/advisors/my-advisor').set(as(omar)).expect(404);
});

test('Req 13: the email text names the right event', () => {
  assert.match(advisorEmailContent({ full_name: 'Sara Adel', action: 'ADDED' }).text, /added to the GUC advising system/);
  assert.match(advisorEmailContent({ full_name: 'Sara Adel', action: 'REMOVED' }).text, /removed from the GUC advising system/);
});

test('Req 13: a failing mailer does not undo the change', async () => {
  const failing = createApp({ secret, sendResetEmail: async () => {}, sendAdvisorEmail: async () => { throw new Error('SMTP is not configured'); } });
  const { body } = await request(failing).post('/api/advisors/add').set(as(coordinator)).send({ guc_email: sara.guc_email }).expect(200);
  assert.equal(body.email_sent, false);
  assert.equal((await User.findById(sara._id)).advising_active, true);
});

// ---------------------------------------------------------------- Req 57
const put = (user, preferences) => request(app).put('/api/academic/preferences').set(as(user)).send({ preferences });

test('Req 57: submit several preferences of the same type, ranked by priority', async () => {
  const { body } = await put(omar, [
    { type: 'AVOIDED_DAY', value: 'friday', priority: 2 },
    { type: 'AVOIDED_DAY', value: 'Saturday', priority: 3 },
    { type: 'DAY_OFF', value: 'Thursday', priority: 1 },
    { type: 'PREFERRED_TIME_RANGE', value: '09:00-13:00', priority: 4 },
    { type: 'PREFERRED_GROUP', value: 'G3', priority: 5 },
    { type: 'NOTE', value: 'I commute from Giza.' },
  ]).expect(200);
  assert.deepEqual(body.preferences.map((p) => [p.type, p.value, p.priority]), [
    ['DAY_OFF', 'Thursday', 1], ['AVOIDED_DAY', 'Friday', 2], ['AVOIDED_DAY', 'Saturday', 3],
    ['PREFERRED_TIME_RANGE', '09:00-13:00', 4], ['PREFERRED_GROUP', 'G3', 5], ['NOTE', 'I commute from Giza.', 6],
  ]);
  assert.ok(body.last_updated);
});

test('Req 57: an update replaces the earlier submission; an empty list clears it', async () => {
  const { body } = await put(omar, [{ type: 'PREFERRED_DAY', value: 'Sunday' }]).expect(200);
  assert.equal(body.preferences.length, 1);
  assert.equal(await SchedulingPreference.countDocuments({ student_id: omar._id }), 1);
  assert.equal((await request(app).get('/api/academic/preferences').set(as(omar)).expect(200)).body.preferences[0].value, 'Sunday');
  assert.deepEqual((await put(omar, []).expect(200)).body.preferences, []);
  assert.equal(await SchedulingPreference.countDocuments({ student_id: omar._id }), 0);
});

test('Req 57: invalid preferences are rejected with per-item errors and change nothing', async () => {
  await put(omar, [{ type: 'PREFERRED_DAY', value: 'Sunday' }]).expect(200);
  const { body } = await put(omar, [
    { type: 'PREFERRED_DAY', value: 'Monday' },
    { type: 'FAVOURITE_COLOUR', value: 'blue' },
    { type: 'AVOIDED_DAY', value: 'Someday' },
    { type: 'AVOIDED_TIME_RANGE', value: '14:00-09:00' },
    { type: 'PREFERRED_GROUP', value: 'G1', priority: 0 },
  ]).expect(400);
  assert.deepEqual(Object.keys(body.errors), ['1', '2', '3', '4']);
  await put(omar, [{ type: 'NOTE', value: 'a' }, { type: 'NOTE', value: 'b' }]).expect(400); // one note only
  await request(app).put('/api/academic/preferences').set(as(omar)).send({ preferences: 'x' }).expect(400);
  assert.equal((await SchedulingPreference.find({ student_id: omar._id }).lean())[0].value, 'Sunday'); // untouched
});

test('Req 57: only Advising Students, and only before the advising deadline', async () => {
  await put(laila, [{ type: 'PREFERRED_DAY', value: 'Sunday' }]).expect(403); // Normal Student
  await AcademicTerm.updateOne({ _id: term._id }, { $set: { advising_deadline: new Date(Date.now() - DAY) } });
  const late = await put(omar, [{ type: 'PREFERRED_DAY', value: 'Monday' }]).expect(403);
  assert.match(late.body.message, /advising deadline/);
  assert.equal((await SchedulingPreference.find({ student_id: omar._id }).lean())[0].value, 'Sunday'); // not changed
  await request(app).get('/api/academic/preferences').set(as(omar)).expect(200); // viewing is still allowed
  await AcademicTerm.updateOne({ _id: term._id }, { $set: { advising_deadline: new Date(Date.now() + 10 * DAY) } });
  await put(omar, [{ type: 'PREFERRED_DAY', value: 'Monday' }]).expect(200);
});

// ---------------------------------------------------------------- Req 58
test('Req 58: advisor (assigned students) and coordinator see preferences in priority order with the update time', async () => {
  await put(mona, [{ type: 'AVOIDED_DAY', value: 'Tuesday', priority: 2 }, { type: 'DAY_OFF', value: 'Saturday', priority: 1 }]).expect(200);
  const view = (user, id) => request(app).get(`/api/academic/preferences/${id}`).set(as(user));

  const asCoordinator = (await view(coordinator, mona._id).expect(200)).body;
  assert.equal(asCoordinator.submitted, true);
  assert.deepEqual(asCoordinator.preferences.map((p) => p.priority), [1, 2]);
  assert.ok(asCoordinator.last_updated);

  await StudentProfile.updateOne({ _id: mona._id }, { $set: { assigned_advisor_id: amr._id } });
  assert.equal((await view(amr, mona._id).expect(200)).body.preferences.length, 2);
  await view(sara, mona._id).expect(403); // sara is not Mona's advisor
  await view(amr, laila._id).expect(400); // Normal Student
  await view(coordinator, 'no-such-student').expect(404);
});

test('Req 58: a student with no preferences still gets an answer', async () => {
  const { body } = await request(app).get(`/api/academic/preferences/${nour._id}`).set(as(coordinator)).expect(200);
  assert.deepEqual([body.submitted, body.preferences, body.last_updated], [false, [], null]);
});

// ---------------------------------------------------------------- Req 61
test('Req 61: failed and unattended courses are listed as mandatory unless a removal was approved', async () => {
  await AcademicRecord.create([
    { student_id: mona._id, course_code: 'CSEN 301', grade: 'F', semester_taken: 'Winter', academic_year: '2025/2026', status: 'FAILED' },
    { student_id: mona._id, course_code: 'MATH 201', semester_taken: 'Spring', academic_year: '2025/2026', status: 'UNATTENDED' },
    { student_id: mona._id, course_code: 'PHYS 101', grade: 'F', semester_taken: 'Winter', academic_year: '2024/2025', status: 'FAILED', removal_approved: true },
    { student_id: mona._id, course_code: 'CSEN 102', grade: 'A', semester_taken: 'Winter', academic_year: '2024/2025', status: 'COMPLETED' },
  ]);
  const get = (user, id) => request(app).get(`/api/academic/failed-unattended/${id}`).set(as(user));
  const { body } = await get(amr, mona._id).expect(200);
  assert.deepEqual(body.courses.map((c) => [c.course_code, c.status, c.mandatory]), [
    ['PHYS 101', 'FAILED', false], ['CSEN 301', 'FAILED', true], ['MATH 201', 'UNATTENDED', true],
  ]);
  await get(sara, mona._id).expect(403);
  await get(mona, mona._id).expect(403); // students cannot use this route
  assert.deepEqual((await get(coordinator, nour._id).expect(200)).body.courses, []);
});
