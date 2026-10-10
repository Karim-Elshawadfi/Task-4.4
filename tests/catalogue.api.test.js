// API tests for Req 16-21 and 128 (HTTP, roles, database changes) with an in-memory database.
// node --test tests/catalogue.api.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { randomUUID } = require('crypto');
const request = require('supertest');

const User = require('../models/User');
const Course = require('../models/Course');
const AcademicTerm = require('../models/AcademicTerm');
const { catalogueDocs } = require('../data/curriculum');
const { memoryModel } = require('./helpers/memoryModels');

const bcrypt = require('bcryptjs');
const AuthSession = require('../models/AuthSession');
const { createApp } = require('../app');

// The real team app from app.js: Person 1's login (Req 1) + these routes, mounted exactly as in production.
const app = createApp({ secret: 'catalogue-test-secret-at-least-32-characters', sendResetEmail: async () => {} });

const PASSWORD = 'CatalogueTest123!';
const hash = bcrypt.hashSync(PASSWORD, 4);
const mk = (role, guc_email) => ({ _id: randomUUID(), role, full_name: role, guc_email, account_status: 'ACTIVE', password_hash: hash });
const admin = mk('ADMIN', 'admin@guc.edu.eg');
const coordinator = mk('COORDINATOR', 'coordinator@guc.edu.eg');
const student = mk('STUDENT', 'student@student.guc.edu.eg');

memoryModel(User, [admin, coordinator, student]);
memoryModel(AuthSession, []);
const courses = memoryModel(Course, catalogueDocs().map((d) => ({ _id: randomUUID(), ...d })));
const terms = memoryModel(AcademicTerm, []);

// Log in through POST /api/auth/login (tokens need a stored session, so they cannot be made by hand).
const tokens = {};
test.before(async () => {
  for (const u of [admin, coordinator, student]) {
    const r = await request(app).post('/api/auth/login').send({ email: u.guc_email, password: PASSWORD }).expect(200);
    tokens[u._id] = r.body.token;
  }
});
const auth = (u) => ({ Authorization: `Bearer ${tokens[u._id]}` });
const as = (u) => ({
  get: (url) => request(app).get(url).set(auth(u)),
  post: (url, body) => request(app).post(url).set(auth(u)).send(body),
  put: (url, body) => request(app).put(url).set(auth(u)).send(body),
  del: (url) => request(app).delete(url).set(auth(u)),
});

const WINTER = {
  academic_year: '2026/2027', season: 'WINTER',
  term_start: '2026-09-12', teaching_start: '2026-09-19', teaching_end: '2026-12-31', term_end: '2027-01-31',
  advising_deadline: '2026-10-31T21:59:00Z', swap_deadline: '2026-09-30T21:59:00Z',
};

// ---------------------------------------------------------------- terms
test('Req 16: administrator creates a term; duplicates and bad dates are refused', async () => {
  const r = await as(admin).post('/api/terms', WINTER).expect(201);
  assert.equal(r.body.term.name, 'Winter 2026/2027');
  assert.equal(terms.length, 1);
  await as(admin).post('/api/terms', WINTER).expect(409);
  const bad = await as(admin).post('/api/terms', { ...WINTER, season: 'SPRING', teaching_end: '2027-03-01' }).expect(400);
  assert.ok(bad.body.errors.teaching_end);
  await as(coordinator).post('/api/terms', { ...WINTER, season: 'SUMMER' }).expect(403);
  await request(app).post('/api/terms').send(WINTER).expect(401);
});

test('Req 17: administrator updates a term; status shows what is open', async () => {
  const id = terms[0]._id;
  const r = await as(admin).put(`/api/terms/${id}`, { advising_deadline: '2026-11-15T21:59:00Z' }).expect(200);
  assert.equal(new Date(r.body.term.advising_deadline).toISOString(), '2026-11-15T21:59:00.000Z');
  assert.equal(typeof r.body.term.status.advisingOpen, 'boolean');
  await as(admin).put(`/api/terms/${id}`, { term_end: '2026-09-01' }).expect(400);
  await as(admin).put(`/api/terms/${randomUUID()}`, {}).expect(404);
  await as(coordinator).put(`/api/terms/${id}`, {}).expect(403);
  const list = await as(coordinator).get('/api/terms').expect(200);
  assert.equal(list.body.terms.length, 1);
  await as(student).get('/api/terms/current').expect(200);
  await as(student).get('/api/terms').expect(403);
});

// ---------------------------------------------------------------- catalogue
test('Req 19: view the catalogue with filters and a course with its prerequisites', async () => {
  let r = await as(admin).get('/api/catalogue/courses').expect(200);
  assert.equal(r.body.total, 76);
  r = await as(admin).get('/api/catalogue/courses?type=ELECTIVE').expect(200);
  assert.equal(r.body.total, 10);
  r = await as(admin).get('/api/catalogue/courses?major=DMET&semester=6').expect(200);
  assert.ok(r.body.courses.some((c) => c.course_code === 'DMET 603'));
  assert.ok(!r.body.courses.some((c) => c.course_code === 'CSEN 604'));
  r = await as(admin).get('/api/catalogue/courses?search=data%20str').expect(200);
  assert.deepEqual(r.body.courses.map((c) => c.course_code), ['CSEN 301']);

  r = await as(admin).get(`/api/catalogue/courses/${encodeURIComponent('CSEN 301')}`).expect(200);
  assert.deepEqual(r.body.prerequisiteDetails, [{ code: 'CSEN 102', name: 'Introduction to Computer Science' }, { code: 'CSEN 202', name: 'Introduction to Computer Programming' }]);
  assert.ok(r.body.requiredBy.some((c) => c.code === 'CSEN 401'));
  await as(admin).get('/api/catalogue/courses/csen301').expect(200); // code is normalised
  await as(admin).get('/api/catalogue/courses/ZZZ%20999').expect(404);
  await as(student).get('/api/catalogue/courses').expect(403);
});

test('Req 18: administrator creates a course (incl. electives); bad input and duplicates refused', async () => {
  const body = { course_code: 'csen 1070', course_name: 'Robotics', credit_hours: 4, course_type: 'ELECTIVE',
    majors: ['CS'], recommended_semester: 9, offering_season: 'BOTH', prerequisites: ['CSEN 301'] };
  const r = await as(admin).post('/api/catalogue/courses', body).expect(201);
  assert.equal(r.body.course.course_code, 'CSEN 1070');
  assert.deepEqual(r.body.course.curriculum, []);
  await as(admin).post('/api/catalogue/courses', body).expect(409);
  const bad = await as(admin).post('/api/catalogue/courses', { ...body, course_code: 'CSEN 1071', credit_hours: 0, prerequisites: ['XYZ 101'] }).expect(400);
  assert.deepEqual(Object.keys(bad.body.errors).sort(), ['credit_hours', 'prerequisites']);
  await as(coordinator).post('/api/catalogue/courses', { ...body, course_code: 'CSEN 1072' }).expect(403);
});

test('Req 20: administrator updates a course; code is fixed and loops are refused', async () => {
  const url = `/api/catalogue/courses/${encodeURIComponent('CSEN 1070')}`;
  const r = await as(admin).put(url, { course_name: 'Robotics and Autonomy', credit_hours: 6 }).expect(200);
  assert.equal(r.body.course.course_name, 'Robotics and Autonomy');
  assert.equal(r.body.course.credit_hours, 6);
  assert.deepEqual(r.body.course.prerequisites, ['CSEN 301']);
  await as(admin).put(url, { course_code: 'CSEN 1099' }).expect(400);
  const loop = await as(admin).put(`/api/catalogue/courses/${encodeURIComponent('CSEN 102')}`, { prerequisites: ['CSEN 301'] }).expect(400);
  assert.match(loop.body.errors.prerequisites, /loop/);
  // DMET 502 keeps its special plan (sem 5 DMET, sem 7 CS) when only the name changes
  const d = await as(admin).put(`/api/catalogue/courses/${encodeURIComponent('DMET 502')}`, { course_name: 'Computer Graphics I' }).expect(200);
  assert.equal(d.body.course.curriculum.length, 2);
});

test('Req 21: delete a course; refused while other courses need it', async () => {
  const r = await as(admin).del(`/api/catalogue/courses/${encodeURIComponent('CSEN 301')}`).expect(409);
  assert.match(r.body.message, /prerequisite of/);
  await as(admin).del(`/api/catalogue/courses/${encodeURIComponent('CSEN 1070')}`).expect(200);
  assert.ok(!courses.some((c) => c.course_code === 'CSEN 1070'));
  await as(admin).del(`/api/catalogue/courses/${encodeURIComponent('CSEN 1070')}`).expect(404);
  await as(coordinator).del(`/api/catalogue/courses/${encodeURIComponent('CSEN 102')}`).expect(403);
});

test('Req 128: invalid CSV -> row errors and NOTHING imported', async () => {
  const before = JSON.stringify(courses);
  const csv = fs.readFileSync('data/sample-courses-invalid.csv', 'utf8');
  const r = await as(admin).post('/api/catalogue/courses/import', { csv }).expect(422);
  assert.ok(r.body.errors.length >= 6);
  assert.ok(r.body.errors.every((e) => e.row >= 2 && e.message));
  assert.equal(JSON.stringify(courses), before, 'database unchanged');
  await as(admin).post('/api/catalogue/courses/import', { csv: '' }).expect(400);
});

test('Req 128: valid CSV -> check first (dry run), then create new codes and update existing ones', async () => {
  const csv = fs.readFileSync('data/sample-courses.csv', 'utf8');
  const count = courses.length;
  const dry = await as(admin).post('/api/catalogue/courses/import', { csv, dryRun: true }).expect(200);
  assert.deepEqual([dry.body.created, dry.body.updated], [3, 1]);
  assert.equal(courses.length, count, 'dry run writes nothing');

  const r = await as(admin).post('/api/catalogue/courses/import', { csv }).expect(200);
  assert.deepEqual([r.body.created, r.body.updated], [3, 1]);
  assert.equal(courses.length, count + 3);
  assert.deepEqual(courses.find((c) => c.course_code === 'CSEN 1061').prerequisites, ['CSEN 301', 'MATH 401']);
  // importing the same file again creates no duplicates
  const again = await as(admin).post('/api/catalogue/courses/import', { csv }).expect(200);
  assert.deepEqual([again.body.created, again.body.updated], [0, 4]);
  assert.equal(courses.filter((c) => c.course_code === 'CSEN 1067').length, 1);
  await as(coordinator).post('/api/catalogue/courses/import', { csv }).expect(403);
});

test('Req 128: a large CSV (over the 8 KB limit of the login routes) is accepted', async () => {
  const header = 'course_code,course_name,credit_hours,course_type,faculty/major,recommended_semester,offering_season,prerequisites';
  const rows = Array.from({ length: 300 }, (_, i) => `ELEC ${1100 + i},Elective topic number ${i} with a long descriptive name,4,elective,CS;DMET,9,both,CSEN 301`);
  const csv = [header, ...rows].join('\n');
  assert.ok(csv.length > 8 * 1024);
  const r = await as(admin).post('/api/catalogue/courses/import', { csv, dryRun: true }).expect(200);
  assert.equal(r.body.created, 300);
});

test('login is required, and logging out ends access', async () => {
  await request(app).get('/api/catalogue/courses').expect(401);
  await request(app).get('/api/catalogue/courses').set({ Authorization: 'Bearer not-a-token' }).expect(401);
  const r = await request(app).post('/api/auth/login').send({ email: coordinator.guc_email, password: PASSWORD }).expect(200);
  const bearer = { Authorization: `Bearer ${r.body.token}` };
  await request(app).get('/api/catalogue/courses').set(bearer).expect(200);
  await request(app).post('/api/auth/logout').set(bearer).send({}).expect(200);
  await request(app).get('/api/catalogue/courses').set(bearer).expect(401);
});
