// End-to-end tests for Req 22-23, 25-30 against an in-memory MongoDB, through the real app
// from app.js (so Person 1's login and roles are enforced exactly as in production).
// node --test tests/offerings.api.test.js
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const { createApp } = require('../app');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const StudentProfile = require('../models/StudentProfile');
const AcademicTerm = require('../models/AcademicTerm');
const Course = require('../models/Course');
const CourseOffering = require('../models/CourseOffering');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const GroupAssignment = require('../models/GroupAssignment');
const { hashCode } = require('../services/authSecurity');

const secret = 'offerings-test-secret-32-characters-minimum';
const app = createApp({ secret, sendResetEmail: async () => {} });

// Mint a token the way POST /api/auth/login does, so `protect` accepts it without rate limits.
const tokens = new Map();
const signIn = async (user) => {
  const session = await AuthSession.create({
    user_id: user._id,
    credential_hash: hashCode(user._id, user.password_hash, secret),
    expires_at: new Date(Date.now() + 3600e3),
  });
  tokens.set(user._id, jwt.sign({ id: user._id }, secret, {
    algorithm: 'HS256', jwtid: session._id, expiresIn: '1h', issuer: 'guc-scheduling', audience: 'guc-scheduling',
  }));
};
const as = (user) => ({
  get: (url) => request(app).get(url).set({ Authorization: `Bearer ${tokens.get(user._id)}` }),
  post: (url, body) => request(app).post(url).set({ Authorization: `Bearer ${tokens.get(user._id)}` }).send(body),
  put: (url, body) => request(app).put(url).set({ Authorization: `Bearer ${tokens.get(user._id)}` }).send(body),
  del: (url) => request(app).delete(url).set({ Authorization: `Bearer ${tokens.get(user._id)}` }),
});

let mongo, admin, coordinator, advisor, term, normals = [], advising;

const slot = (over = {}) => ({
  type: 'LECTURE', group_number: '1', day: 'MONDAY', start_time: '10:00', end_time: '11:30',
  room: 'C7.01', max_capacity: 60, ...over,
});
const CS3 = [{ major: 'CS', semester: 3 }];

test.before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());

  const base = { password_hash: 'x' };
  admin = await User.create({ ...base, full_name: 'Ahmed Saeed', guc_email: 'admin@guc.edu.eg', role: 'ADMIN' });
  coordinator = await User.create({ ...base, full_name: 'Rania Lotfy', guc_email: 'coordinator@guc.edu.eg', role: 'COORDINATOR' });
  advisor = await User.create({ ...base, full_name: 'Amr Hassan', guc_email: 'amr.hassan@guc.edu.eg', role: 'ADVISOR' });
  await Promise.all([signIn(admin), signIn(coordinator), signIn(advisor)]);

  const student = async (full_name, profile) => {
    const u = await User.create({ ...base, full_name, guc_email: `${full_name.toLowerCase().replace(/ /g, '.')}@student.guc.edu.eg`, role: 'STUDENT' });
    await StudentProfile.create({ _id: u._id, ...profile });
    return u;
  };
  for (const [name, id] of [['Laila Mahmoud', '56-2001'], ['Adham Fouad', '56-2002'], ['Rana Yasser', '56-2003']]) {
    normals.push(await student(name, { guc_student_id: id, student_type: 'NORMAL', major: 'CS', current_semester: 3 }));
  }
  advising = await student('Omar Khaled', { guc_student_id: '52-1001', student_type: 'ADVISING', major: 'CS', current_semester: 3 });

  term = await AcademicTerm.create({
    academic_year: '2026/2027', season: 'WINTER', name: 'Winter 2026/2027',
    term_start: '2026-09-12', teaching_start: '2026-09-19', teaching_end: '2026-12-31', term_end: '2027-01-31',
    advising_deadline: '2026-10-31T21:59:00Z', swap_deadline: '2026-09-30T21:59:00Z',
  });
  for (const [course_code, course_name] of [
    ['CSEN 301', 'Data Structures and Algorithms'],
    ['MATH 301', 'Mathematics III'],
    ['CSEN 501', 'Data Base I'],
  ]) {
    await Course.create({ course_code, course_name, credit_hours: 6, course_type: 'CORE', majors: ['CS', 'DMET'], recommended_semester: 3 });
  }
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});


test.beforeEach(async () => {
  await GroupAssignment.deleteMany({});
  await ScheduleTemplate.deleteMany({});
  await CourseOffering.deleteMany({});
});
async function offer(over = {}) {
  const r = await as(admin).post('/api/offerings', {
    term_id: term._id, course_code: 'CSEN 301', instructors: ['Dr. Review'],
    eligible_groups: CS3, groups: [slot()], ...over,
  }).expect(201);
  return r.body.offering;
}
async function draftFor(o) {
  await as(admin).put(`/api/offerings/${o._id}/publication`, { published: true }).expect(200);
  const r = await as(coordinator).post('/api/templates', {
    term_id: term._id, major: 'CS', semester: 3, study_group: 'REV',
    entries: [{ offering_id: o._id, slot_ids: [o.groups[0]._id] }],
  }).expect(201);
  return r.body.template;
}
test('REVIEW: creating two overlapping slots in one room must be rejected', async () => {
  const r = await as(admin).post('/api/offerings', {
    term_id: term._id, course_code: 'CSEN 301', instructors: ['Dr. Review'], eligible_groups: CS3,
    groups: [slot(), slot({ type: 'TUTORIAL', group_number: 'T1' })],
  });
  assert.equal(r.status, 409, `Two classes in C7.01 at Monday 10:00 were accepted with HTTP ${r.status}`);
});
test('REVIEW: editing two slots together into the same room and time must be rejected', async () => {
  const o = await offer({ groups: [slot(), slot({type: 'TUTORIAL', group_number: 'T1', day: 'TUESDAY', room: 'C8.01'})] });
  const groups = o.groups.map(g => ({ ...g, day: 'WEDNESDAY', room: 'NEW.ROOM' }));
  const r = await as(admin).put(`/api/offerings/${o._id}`, { groups });
  assert.equal(r.status, 409, `Two conflicting updated slots were accepted with HTTP ${r.status}`);
});
test('REVIEW: a draft cannot be published after its offering is unpublished', async () => {
  const o = await offer(); const t = await draftFor(o);
  await as(admin).put(`/api/offerings/${o._id}/publication`, { published: false }).expect(200);
  const r = await as(coordinator).put(`/api/templates/${t._id}/publication`, { published: true });
  let assigned = null;
  if (r.status === 200) {
    const a = await as(coordinator).post(`/api/templates/${t._id}/students`, { student_ids: [normals[0]._id] });
    assigned = a.body.assigned?.length;
  }
  assert.equal(r.status, 409, `Unpublished course became a published template; ${assigned} student(s) assigned`);
});
test('REVIEW: eligibility cannot be removed from an assigned published template', async () => {
  const o = await offer(); const t = await draftFor(o);
  await as(coordinator).put(`/api/templates/${t._id}/publication`, { published: true }).expect(200);
  const assigned = await as(coordinator).post(`/api/templates/${t._id}/students`, { student_ids: [normals[0]._id] });
  assert.equal(assigned.body.assigned.length, 1);
  const r = await as(admin).put(`/api/offerings/${o._id}`, { eligible_groups: [{major: 'DMET', semester: 3}] });
  assert.equal(r.status, 409, `CS student's scheduled course was changed to DMET-only (HTTP ${r.status})`);
});
test('REVIEW: major and semester filters must match the same eligible group', async () => {
  await offer({ eligible_groups: [{major:'CS', semester:3}, {major:'DMET', semester:5}] });
  const r = await as(admin).get(`/api/offerings?term_id=${term._id}&major=CS&semester=5`).expect(200);
  assert.equal(r.body.total, 0, 'CS semester 5 incorrectly matched CS3 + DMET5');
});
test('REVIEW: concurrent requests must not assign three students to one remaining seat', async () => {
  const o = await offer({ groups: [slot({max_capacity:1})] }); const t = await draftFor(o);
  await as(coordinator).put(`/api/templates/${t._id}/publication`, {published:true}).expect(200);
  const responses = await Promise.all(normals.map(n => as(coordinator).post(`/api/templates/${t._id}/students`, {student_ids:[n._id]})));
  const seated = await GroupAssignment.countDocuments({template_id:t._id});
  const after = await CourseOffering.findById(o._id).lean();
  assert.equal(seated, 1, `${seated} students assigned to capacity 1; stored assigned_count=${after.groups[0].assigned_count}`);
  assert.equal(after.groups[0].assigned_count, 1);
  assert.equal(responses.reduce((n, r) => n + r.body.assigned.length, 0), 1);
});

test('REGRESSION: swapping room/time positions in one valid edit does not clash with stale slots', async () => {
  const o = await offer({groups: [slot(), slot({type:'TUTORIAL', group_number:'T1', day:'TUESDAY', room:'C8.01'})]});
  const [a,b] = o.groups;
  const r = await as(admin).put(`/api/offerings/${o._id}`, {groups: [
    {...a, day:b.day, room:b.room}, {...b, day:a.day, room:a.room},
  ]}).expect(200);
  assert.equal(r.body.offering.groups.find(g => g._id === a._id).day, 'TUESDAY');
});

test('REGRESSION: concurrent offerings cannot both reserve the same room/time', async () => {
  const payload = {term_id:term._id, instructors:['Dr. Review'], eligible_groups:CS3, groups:[slot()]};
  const replies = await Promise.all(['CSEN 301','MATH 301'].map(course_code =>
    as(admin).post('/api/offerings', {...payload,course_code})));
  assert.deepEqual(replies.map(r => r.status).sort(), [201,409]);
  assert.equal(await CourseOffering.countDocuments({}), 1);
});

test('REGRESSION: a failed batch rolls back seats, assignments and workflow history', async (t) => {
  const o = await offer(); const template = await draftFor(o);
  await as(coordinator).put(`/api/templates/${template._id}/publication`, {published:true}).expect(200);
  const WorkflowAction = require('../models/WorkflowAction');
  const beforeActions = await WorkflowAction.countDocuments({});
  const original = GroupAssignment.findOneAndUpdate;
  let calls = 0;
  t.mock.method(GroupAssignment, 'findOneAndUpdate', function (...args) {
    if (++calls === 2) throw new Error('Injected assignment storage failure');
    return original.apply(this, args);
  });
  await as(coordinator).post(`/api/templates/${template._id}/students`, {student_ids:normals.slice(0,2).map(n=>n._id)}).expect(500);
  assert.equal(await GroupAssignment.countDocuments({}), 0);
  assert.equal((await CourseOffering.findById(o._id).lean()).groups[0].assigned_count, 0);
  assert.equal(await WorkflowAction.countDocuments({}), beforeActions);
});

test('REGRESSION: concurrent reassignment of one student leaves exactly one counted seat', async () => {
  const o = await offer(); const first = await draftFor(o);
  const second = (await as(coordinator).post('/api/templates', {
    term_id:term._id, major:'CS', semester:3, study_group:'SECOND', entries:first.entries,
  }).expect(201)).body.template;
  for (const template of [first,second]) await as(coordinator).put(`/api/templates/${template._id}/publication`, {published:true}).expect(200);
  const replies = await Promise.all([first,second].map(template =>
    as(coordinator).post(`/api/templates/${template._id}/students`, {student_ids:[normals[0]._id]})));
  assert(replies.every(r=>r.status===200));
  assert.equal(await GroupAssignment.countDocuments({student_id:normals[0]._id}), 1);
  assert.equal((await CourseOffering.findById(o._id).lean()).groups[0].assigned_count, 1);
});

test('REGRESSION: assignment rechecks eligibility even when a template is already published', async () => {
  const o = await offer(); const template = await draftFor(o);
  await as(coordinator).put(`/api/templates/${template._id}/publication`, {published:true}).expect(200);
  // Simulate an inconsistent import/legacy writer outside the P6 API.
  await CourseOffering.updateOne({_id:o._id}, {$set:{eligible_groups:[{major:'DMET',semester:3}]}});
  const r = await as(coordinator).post(`/api/templates/${template._id}/students`, {student_ids:[normals[0]._id]}).expect(200);
  assert.equal(r.body.assigned.length, 0);
  assert.match(r.body.skipped[0].reason, /not offered to CS/);
  assert.equal(await GroupAssignment.countDocuments({}), 0);
  assert.equal((await CourseOffering.findById(o._id).lean()).groups[0].assigned_count, 0);
});
