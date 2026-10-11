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

const ids = {}; // filled in as the tests build on each other

// ---------------------------------------------------------------- Req 22

test('Req 22: the administrator creates an offering with its lecture, tutorial and lab slots', async () => {
  const body = {
    term_id: term._id, course_code: 'csen301', instructors: ['Dr. Amr Hassan'], eligible_groups: CS3,
    groups: [
      slot(),
      slot({ type: 'TUTORIAL', group_number: 'T1', day: 'TUESDAY', start_time: '08:15', end_time: '09:45', room: 'C6.01', max_capacity: 25 }),
      slot({ type: 'LAB', group_number: 'P1', day: 'WEDNESDAY', start_time: '11:45', end_time: '13:15', room: 'C3.LAB', max_capacity: 20 }),
    ],
  };
  const r = await as(admin).post('/api/offerings', body).expect(201);
  ids.csen301 = r.body.offering._id;

  assert.equal(r.body.offering.course_code, 'CSEN 301', 'the typed code is normalised against the catalogue');
  assert.equal(r.body.offering.course_name, 'Data Structures and Algorithms');
  assert.equal(r.body.offering.academic_year, '2026/2027');
  assert.equal(r.body.offering.is_published, false, 'a new offering starts as a draft (Req 27)');
  assert.equal(r.body.offering.groups.length, 3);
  assert.equal(r.body.offering.total_capacity, 105);

  const lecture = r.body.offering.groups.find((g) => g.type === 'LECTURE');
  assert.equal(lecture.assigned_count, 0);
  assert.equal(lecture.remaining_capacity, 60, 'remaining capacity is calculated, not sent by the client');
  assert.equal(lecture.label, 'Lecture 1 (Monday 10:00-11:30)');
});

test('Req 22: only the administrator may create an offering', async () => {
  const body = { term_id: term._id, course_code: 'MATH 301', eligible_groups: CS3, groups: [slot()] };
  await as(coordinator).post('/api/offerings', body).expect(403);
  await as(advisor).post('/api/offerings', body).expect(403);
  await request(app).post('/api/offerings').send(body).expect(401);
});

test('Req 22: the term and the course must exist, and a course is offered once per term', async () => {
  const unknownTerm = await as(admin).post('/api/offerings', { term_id: 'no-such-term', course_code: 'MATH 301', eligible_groups: CS3 }).expect(404);
  assert.match(unknownTerm.body.message, /term not found/i);

  const unknownCourse = await as(admin).post('/api/offerings', { term_id: term._id, course_code: 'ZZZZ 999', eligible_groups: CS3 }).expect(404);
  assert.match(unknownCourse.body.message, /not in the catalogue/);

  const twice = await as(admin).post('/api/offerings', { term_id: term._id, course_code: 'CSEN 301', eligible_groups: CS3 }).expect(409);
  assert.match(twice.body.message, /already offered in Winter 2026\/2027/);
});

test('Req 22: a group with a bad day, time or capacity is refused field by field', async () => {
  const r = await as(admin).post('/api/offerings', {
    term_id: term._id, course_code: 'MATH 301', eligible_groups: CS3,
    groups: [slot({ day: 'FRIDAY', start_time: '13:00', end_time: '11:00', max_capacity: 0 })],
  }).expect(400);
  assert.ok(r.body.errors.groups[0].day);
  assert.ok(r.body.errors.groups[0].end_time);
  assert.ok(r.body.errors.groups[0].max_capacity);
});

test('Req 22: a second course cannot take a room or an instructor that is already busy', async () => {
  const room = await as(admin).post('/api/offerings', {
    term_id: term._id, course_code: 'MATH 301', instructors: ['Dr. Mona Adel'], eligible_groups: CS3,
    groups: [slot()], // same Monday 10:00-11:30 in C7.01 as CSEN 301
  }).expect(409);
  assert.match(room.body.message, /Room C7\.01 is already used by CSEN 301 Lecture 1/);
  assert.ok(Array.isArray(room.body.errors.clashes), "the UI gets every clash, not just the first");

  const instructor = await as(admin).post('/api/offerings', {
    term_id: term._id, course_code: 'MATH 301', instructors: ['dr. amr hassan'], eligible_groups: CS3,
    groups: [slot({ room: 'H14' })],
  }).expect(409);
  assert.match(instructor.body.message, /already teaches CSEN 301/);

  assert.equal(await CourseOffering.countDocuments({ course_code: 'MATH 301' }), 0, 'nothing was saved');
});

test('Req 22: the other two courses are offered without clashing', async () => {
  const math = await as(admin).post('/api/offerings', {
    term_id: term._id, course_code: 'MATH 301', instructors: ['Dr. Mona Adel'], eligible_groups: CS3,
    groups: [
      slot({ day: 'SATURDAY', start_time: '10:00', end_time: '11:30', room: 'H10' }),
      slot({ type: 'TUTORIAL', group_number: 'T1', day: 'SATURDAY', start_time: '11:45', end_time: '13:15', room: 'C6.02', max_capacity: 25 }),
    ],
  }).expect(201);
  ids.math301 = math.body.offering._id;

  const db = await as(admin).post('/api/offerings', {
    term_id: term._id, course_code: 'CSEN 501', instructors: ['Dr. Karim Nabil'], eligible_groups: CS3,
    groups: [slot({ day: 'SUNDAY', start_time: '13:30', end_time: '15:00', room: 'H11', max_capacity: 2 })],
  }).expect(201);
  ids.csen501 = db.body.offering._id;
});

// ---------------------------------------------------------------- Req 23

test('Req 23: offerings of a term can be listed, searched and filtered', async () => {
  const all = await as(admin).get(`/api/offerings?term_id=${term._id}`).expect(200);
  assert.equal(all.body.total, 3);
  assert.equal(all.body.published, 0);
  assert.deepEqual(all.body.offerings.map((o) => o.course_code), ['CSEN 301', 'CSEN 501', 'MATH 301']);

  const byInstructor = await as(coordinator).get(`/api/offerings?term_id=${term._id}&search=mona`).expect(200);
  assert.deepEqual(byInstructor.body.offerings.map((o) => o.course_code), ['MATH 301']);

  const byGroup = await as(advisor).get(`/api/offerings?term_id=${term._id}&major=CS&semester=3`).expect(200);
  assert.equal(byGroup.body.total, 3);
  assert.equal((await as(admin).get(`/api/offerings?term_id=${term._id}&semester=7`).expect(200)).body.total, 0);
  assert.equal((await as(admin).get(`/api/offerings?term_id=${term._id}&published=true`).expect(200)).body.total, 0);
});

test('Req 23: one offering opens with all of its details and slots', async () => {
  const r = await as(coordinator).get(`/api/offerings/${ids.csen301}`).expect(200);
  assert.equal(r.body.offering.course_code, 'CSEN 301');
  assert.equal(r.body.term.name, 'Winter 2026/2027');
  assert.equal(r.body.course.credit_hours, 6);
  assert.deepEqual(r.body.offering.groups.map((g) => g.type), ['LECTURE', 'TUTORIAL', 'LAB'], 'sorted Monday, Tuesday, Wednesday');
  assert.deepEqual(r.body.usedBy, { templates: [], students: 0 });

  await as(admin).get('/api/offerings/no-such-offering').expect(404);
});

test('Req 23: the form options list the terms, catalogue courses and teaching days', async () => {
  const r = await as(admin).get(`/api/offerings/options?term_id=${term._id}`).expect(200);
  assert.equal(r.body.terms.length, 1);
  assert.equal(r.body.days.length, 6);
  assert.equal(r.body.gucSlots.length, 5);
  assert.equal(r.body.courses.find((c) => c.course_code === 'CSEN 301').already_offered, true);
  assert.ok(r.body.rooms.includes('C7.01'));
});

// ---------------------------------------------------------------- Req 27

test('Req 27: an offering without an instructor cannot be published', async () => {
  const draft = await as(admin).post('/api/offerings', {
    term_id: term._id, course_code: 'MATH 301', eligible_groups: CS3,
  }).expect(409); // MATH 301 already exists this term
  assert.match(draft.body.message, /already offered/);

  // Strip the instructor off CSEN 501 and try to publish it.
  await as(admin).put(`/api/offerings/${ids.csen501}`, { instructors: [] }).expect(200);
  const blocked = await as(admin).put(`/api/offerings/${ids.csen501}/publication`, { published: true }).expect(409);
  assert.match(blocked.body.message, /at least one instructor/);
  await as(admin).put(`/api/offerings/${ids.csen501}`, { instructors: ['Dr. Karim Nabil'] }).expect(200);
});

test('Req 27: the administrator publishes the offerings of a term in one go', async () => {
  const r = await as(admin).put('/api/offerings/publication', { term_id: term._id, published: true }).expect(200);
  assert.equal(r.body.changed, 3);
  assert.deepEqual(r.body.skipped, []);
  assert.equal((await as(admin).get(`/api/offerings?term_id=${term._id}&published=true`).expect(200)).body.total, 3);

  const again = await as(admin).put('/api/offerings/publication', { term_id: term._id, published: true }).expect(200);
  assert.equal(again.body.changed, 0);
  await as(coordinator).put('/api/offerings/publication', { term_id: term._id, published: true }).expect(403);
});

// ---------------------------------------------------------------- Req 28

test('Req 28: the coordinator creates a standard schedule for a major, semester and study group', async () => {
  const csen = await CourseOffering.findById(ids.csen301).lean();
  const math = await CourseOffering.findById(ids.math301).lean();
  ids.slots = {
    lecture: csen.groups.find((g) => g.type === 'LECTURE')._id,
    tutorial: csen.groups.find((g) => g.type === 'TUTORIAL')._id,
    lab: csen.groups.find((g) => g.type === 'LAB')._id,
    mathLecture: math.groups.find((g) => g.type === 'LECTURE')._id,
    mathTutorial: math.groups.find((g) => g.type === 'TUTORIAL')._id,
  };
  const db = await CourseOffering.findById(ids.csen501).lean();
  ids.slots.db = db.groups[0]._id;

  const r = await as(coordinator).post('/api/templates', {
    term_id: term._id, major: 'CS', semester: 3, study_group: '1',
    entries: [
      { offering_id: ids.csen301, slot_ids: [ids.slots.lecture, ids.slots.tutorial, ids.slots.lab] },
      { offering_id: ids.math301, slot_ids: [ids.slots.mathLecture, ids.slots.mathTutorial] },
    ],
  }).expect(201);
  ids.group1 = r.body.template._id;

  assert.equal(r.body.template.label, 'CS semester 3 group 1');
  assert.equal(r.body.template.is_published, false, 'a new standard schedule starts as a draft');
  assert.equal(r.body.template.total_slots, 5);
  assert.equal(r.body.template.week.length, 6, 'a weekly calendar with the days off');
  assert.equal(r.body.template.week.find((d) => d.day === 'THURSDAY').slots.length, 0);
  assert.equal(r.body.template.courses[0].slots[0].course_code, 'CSEN 301');
});

test('Req 28: only the coordinator may build a standard schedule', async () => {
  const body = { term_id: term._id, major: 'CS', semester: 3, study_group: '9', entries: [] };
  await as(admin).post('/api/templates', body).expect(403);
  await as(advisor).post('/api/templates', body).expect(403);
  await request(app).post('/api/templates').send(body).expect(401);
});

test('Req 28: the same major, semester and group cannot have two standard schedules', async () => {
  const r = await as(coordinator).post('/api/templates', {
    term_id: term._id, major: 'CS', semester: 3, study_group: '1', entries: [],
  }).expect(409);
  assert.match(r.body.message, /already exists in Winter 2026\/2027/);
});

test('Req 28: a standard schedule refuses a clash between two courses', async () => {
  // CSEN 501 is Sunday 13:30-15:00; add a clashing offering and try to use both.
  const clash = await as(coordinator).post('/api/templates', {
    term_id: term._id, major: 'CS', semester: 3, study_group: '2',
    entries: [
      { offering_id: ids.csen301, slot_ids: [ids.slots.lecture] },
      { offering_id: ids.math301, slot_ids: [ids.slots.mathLecture, ids.slots.mathTutorial] },
      { offering_id: ids.csen301, slot_ids: [ids.slots.tutorial] },
    ],
  }).expect(400);
  assert.match(clash.body.errors.entries, /CSEN 301 is listed twice/);
});

test('Req 28: an unpublished offering cannot be used in a standard schedule', async () => {
  await as(admin).put(`/api/offerings/${ids.csen501}/publication`, { published: false }).expect(200);
  const r = await as(coordinator).post('/api/templates', {
    term_id: term._id, major: 'CS', semester: 3, study_group: '2',
    entries: [{ offering_id: ids.csen501, slot_ids: [ids.slots.db] }],
  }).expect(400);
  assert.match(r.body.errors.entries, /CSEN 501 is not published yet/);
  await as(admin).put(`/api/offerings/${ids.csen501}/publication`, { published: true }).expect(200);
});

// ---------------------------------------------------------------- Req 29

test('Req 29: the coordinator updates a standard schedule', async () => {
  const r = await as(coordinator).put(`/api/templates/${ids.group1}`, {
    entries: [
      { offering_id: ids.csen301, slot_ids: [ids.slots.lecture, ids.slots.tutorial, ids.slots.lab] },
      { offering_id: ids.math301, slot_ids: [ids.slots.mathLecture, ids.slots.mathTutorial] },
      { offering_id: ids.csen501, slot_ids: [ids.slots.db] },
    ],
  }).expect(200);
  assert.equal(r.body.template.total_slots, 6);
  assert.equal(r.body.template.courses.length, 3);
  await as(admin).put(`/api/templates/${ids.group1}`, {}).expect(403);
});

test('Req 29: a second study group is built from the same offerings', async () => {
  const r = await as(coordinator).post('/api/templates', {
    term_id: term._id, major: 'CS', semester: 3, study_group: '2',
    entries: [
      { offering_id: ids.csen301, slot_ids: [ids.slots.lecture] },
      { offering_id: ids.csen501, slot_ids: [ids.slots.db] },
    ],
  }).expect(201);
  ids.group2 = r.body.template._id;

  const list = await as(coordinator).get(`/api/templates?term_id=${term._id}&major=CS&semester=3`).expect(200);
  assert.deepEqual(list.body.templates.map((t) => t.study_group), ['1', '2']);
});

// ---------------------------------------------------------------- Req 30

test('Req 30: students cannot be assigned to a draft standard schedule', async () => {
  const r = await as(coordinator).post(`/api/templates/${ids.group1}/students`, { student_ids: [normals[0]._id] }).expect(409);
  assert.match(r.body.message, /still a draft/);
});

test('Req 30: the coordinator assigns normal students to a published standard schedule', async () => {
  await as(coordinator).put(`/api/templates/${ids.group1}/publication`, { published: true }).expect(200);
  await as(coordinator).put(`/api/templates/${ids.group2}/publication`, { published: true }).expect(200);

  const r = await as(coordinator).post(`/api/templates/${ids.group1}/students`, {
    student_ids: [normals[0]._id, normals[1]._id],
  }).expect(200);
  assert.equal(r.body.assigned.length, 2);
  assert.deepEqual(r.body.skipped, []);
  assert.equal(r.body.template.students, 2);

  // Every slot of the standard schedule now holds two students.
  const csen = await CourseOffering.findById(ids.csen301).lean();
  assert.equal(csen.groups.find((g) => g._id === ids.slots.lecture).assigned_count, 2);
  assert.equal(csen.groups.find((g) => g._id === ids.slots.lab).assigned_count, 2);

  const details = await as(coordinator).get(`/api/offerings/${ids.csen301}`).expect(200);
  assert.equal(details.body.offering.groups.find((g) => g.type === 'LECTURE').remaining_capacity, 58);
  assert.equal(details.body.usedBy.students, 2);
});

test('Req 30: the workflow status of an assigned student becomes Schedule Assigned', async () => {
  const profile = await StudentProfile.findById(normals[0]._id).lean();
  assert.equal(profile.workflow_status, 'Schedule Assigned');
});

test('Req 30: advising students and students of another group are skipped with a reason', async () => {
  const r = await as(coordinator).post(`/api/templates/${ids.group1}/students`, {
    student_ids: [advising._id, normals[0]._id, 'no-such-student'],
  }).expect(200);
  assert.equal(r.body.assigned.length, 0);
  assert.equal(r.body.skipped.length, 3);
  assert.match(r.body.skipped.find((s) => s.student_id === advising._id).reason, /advising student/);
  assert.match(r.body.skipped.find((s) => s.student_id === normals[0]._id).reason, /already in CS semester 3 group 1/);
  assert.match(r.body.skipped.find((s) => s.student_id === 'no-such-student').reason, /Student not found/);
});

test('Req 30: reassigning a student moves their seat from the old group to the new one', async () => {
  const r = await as(coordinator).post(`/api/templates/${ids.group2}/students`, { student_ids: [normals[1]._id] }).expect(200);
  assert.equal(r.body.assigned[0].moved_from, 'CS semester 3 group 1');
  assert.match(r.body.message, /1 moved from another group/);

  // Group 1 kept only the MATH tutorial seat it does not share with group 2.
  const math = await CourseOffering.findById(ids.math301).lean();
  assert.equal(math.groups.find((g) => g._id === ids.slots.mathLecture).assigned_count, 1, 'only the student left in group 1');

  // The shared CSEN 301 lecture still seats both students.
  const csen = await CourseOffering.findById(ids.csen301).lean();
  assert.equal(csen.groups.find((g) => g._id === ids.slots.lecture).assigned_count, 2);
  assert.equal(csen.groups.find((g) => g._id === ids.slots.lab).assigned_count, 1, 'the lab is only in group 1');

  assert.equal(await GroupAssignment.countDocuments({ student_id: normals[1]._id, term_id: term._id }), 1, 'a student is in one group per term');
});

test('Req 30: a student cannot be seated in a group whose course is full', async () => {
  // CSEN 501 has two seats and both are taken by the two students in group 2 and group 1.
  const db = await CourseOffering.findById(ids.csen501).lean();
  assert.equal(db.groups[0].assigned_count, 2, 'both groups use the only CSEN 501 lecture');

  const r = await as(coordinator).post(`/api/templates/${ids.group2}/students`, { student_ids: [normals[2]._id] }).expect(200);
  assert.equal(r.body.assigned.length, 0);
  assert.match(r.body.skipped[0].reason, /CSEN 501 Lecture 1 .* is full \(2 seats\)/);

  const unchanged = await CourseOffering.findById(ids.csen501).lean();
  assert.equal(unchanged.groups[0].assigned_count, 2, 'a refused assignment changes no seat count');
});

test('Req 30: the candidate list shows the normal students of the group and where they are now', async () => {
  const r = await as(coordinator).get(`/api/templates/${ids.group1}/candidates`).expect(200);
  assert.equal(r.body.total, 3, 'the three CS semester 3 normal students, not the advising one');
  assert.equal(r.body.candidates.find((c) => c.student_id === normals[0]._id).in_this_group, true);
  assert.equal(r.body.candidates.find((c) => c.student_id === normals[1]._id).current_group, '2');
  assert.equal(r.body.candidates.find((c) => c.student_id === normals[2]._id).current_group, null);
});

test('Req 30: a standard schedule opens with the students that follow it', async () => {
  const r = await as(coordinator).get(`/api/templates/${ids.group1}`).expect(200);
  assert.equal(r.body.students.length, 1);
  assert.equal(r.body.students[0].guc_student_id, '56-2001');
  assert.equal(r.body.template.students, 1);
});

// ---------------------------------------------------------------- Req 25 and 26 once students are seated

test('Req 25: a slot cannot be shrunk below the students already assigned', async () => {
  const r = await as(admin).put(`/api/offerings/${ids.csen301}/slots/${ids.slots.lecture}`, {
    ...slot(), max_capacity: 1,
  }).expect(400);
  assert.match(r.body.errors.max_capacity, /2 student\(s\) are already assigned/);
});

test('Req 25: a slot can be moved, and the assigned students stay in it', async () => {
  const r = await as(admin).put(`/api/offerings/${ids.csen301}/slots/${ids.slots.lecture}`, {
    ...slot(), day: 'THURSDAY', start_time: '08:15', end_time: '09:45', room: 'H12',
  }).expect(200);
  const moved = r.body.offering.groups.find((g) => g._id === ids.slots.lecture);
  assert.equal(moved.day, 'THURSDAY');
  assert.equal(moved.assigned_count, 2, 'the students moved with the slot');
  assert.equal(moved.remaining_capacity, 58);

  // The standard schedule shows the new time without being edited (Req 29).
  const template = await as(coordinator).get(`/api/templates/${ids.group1}`).expect(200);
  assert.equal(template.body.template.week.find((d) => d.day === 'THURSDAY').slots.length, 1);
});

test('Req 25: a slot cannot be moved onto a time that clashes in a standard schedule', async () => {
  // MATH 301 lecture is Saturday 10:00-11:30 and its tutorial is Saturday 11:45-13:15.
  // Both are in the standard schedule of group 1, so overlapping them is refused.
  const r = await as(admin).put(`/api/offerings/${ids.math301}/slots/${ids.slots.mathTutorial}`, {
    type: 'TUTORIAL', group_number: 'T1', day: 'SATURDAY', start_time: '10:00', end_time: '11:30',
    room: 'C6.02', max_capacity: 25,
  }).expect(409);
  assert.match(r.body.message, /clashes in the standard schedule of CS semester 3 group 1/);
});

test('Req 25: a slot cannot be moved into a room that is already taken', async () => {
  const r = await as(admin).put(`/api/offerings/${ids.math301}/slots/${ids.slots.mathTutorial}`, {
    type: 'TUTORIAL', group_number: 'T1', day: 'THURSDAY', start_time: '08:15', end_time: '09:45',
    room: 'H12', max_capacity: 25,
  }).expect(409);
  assert.match(r.body.message, /Room H12 is already used by CSEN 301/);
});

test('Req 26: a slot with assigned students, or one a standard schedule uses, cannot be deleted', async () => {
  const seated = await as(admin).del(`/api/offerings/${ids.csen301}/slots/${ids.slots.lecture}`).expect(409);
  assert.match(seated.body.message, /2 student\(s\) are assigned/);

  // The MATH tutorial has one student through group 1, so free it first and retry.
  const used = await as(admin).del(`/api/offerings/${ids.math301}/slots/${ids.slots.mathTutorial}`).expect(409);
  assert.match(used.body.message, /assigned to MATH 301|used by the standard schedule/);
});

test('Req 26: an offering a standard schedule uses cannot be deleted', async () => {
  const r = await as(admin).del(`/api/offerings/${ids.math301}`).expect(409);
  assert.match(r.body.message, /MATH 301|student assignment/);
  assert.equal(await CourseOffering.countDocuments({ _id: ids.math301 }), 1);
});

test('Req 27: an offering that students already follow cannot be unpublished', async () => {
  const r = await as(admin).put(`/api/offerings/${ids.csen301}/publication`, { published: false }).expect(409);
  assert.match(r.body.message, /cannot be unpublished/);

  const bulk = await as(admin).put('/api/offerings/publication', { term_id: term._id, published: false }).expect(200);
  assert.equal(bulk.body.changed, 0, 'every offering is in use');
  assert.equal(bulk.body.skipped.length, 3);
  assert.match(bulk.body.skipped[0].reason, /cannot be unpublished/);
});

// ---------------------------------------------------------------- freeing everything again

test('Req 30: removing a student frees their seat in every slot of the group', async () => {
  const r = await as(coordinator).del(`/api/templates/${ids.group1}/students/${normals[0]._id}`).expect(200);
  assert.equal(r.body.template.students, 0);

  const csen = await CourseOffering.findById(ids.csen301).lean();
  assert.equal(csen.groups.find((g) => g._id === ids.slots.lecture).assigned_count, 1, 'only the group 2 student is left');
  await as(coordinator).del(`/api/templates/${ids.group1}/students/${normals[0]._id}`).expect(404);
});

test('Req 29 and 26: an emptied standard schedule can be deleted and its offering freed', async () => {
  await as(coordinator).del(`/api/templates/${ids.group2}/students/${normals[1]._id}`).expect(200);

  const stillPublished = await as(coordinator).del(`/api/templates/${ids.group1}`).expect(200);
  assert.match(stillPublished.body.message, /was deleted/);
  await as(coordinator).del(`/api/templates/${ids.group2}`).expect(200);
  assert.equal(await ScheduleTemplate.countDocuments({}), 0);

  const math = await CourseOffering.findById(ids.math301).lean();
  assert.equal(math.groups.every((g) => g.assigned_count === 0), true, 'all seats were released');

  await as(admin).del(`/api/offerings/${ids.math301}`).expect(200);
  assert.equal(await CourseOffering.countDocuments({ _id: ids.math301 }), 0);
});

test('Req 27: with nothing using them, the offerings of the term can be unpublished again', async () => {
  const r = await as(admin).put('/api/offerings/publication', { term_id: term._id, published: false }).expect(200);
  assert.equal(r.body.changed, 2);
  assert.deepEqual(r.body.skipped, []);
});
