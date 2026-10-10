// Command-prompt test of Person 5's endpoints (Req 16-21, 128) against the REAL server and database.
//   npm run mongo  (window 1, only if you have no MongoDB)   npm run dev  (window 2)
//   npm run smoke:catalogue  (window 3)
// Creates temporary test users (admin, coordinator, student), logs them in through the real login, calls every endpoint, prints PASS/FAIL, then removes the
// test term and test courses it created so your data is left as it was.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 5050}`;
const enc = encodeURIComponent;

async function runSmoke({ tokens, log = console.log, removeTerm }) {
  let passed = 0;
  let failed = 0;
  const check = (name, ok, detail = '') => {
    if (ok) passed += 1; else failed += 1;
    log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`);
  };
  const call = async (method, url, token, body) => {
    const res = await fetch(BASE + url, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    return { status: res.status, data };
  };
  const why = (r) => `status ${r.status}${r.data?.message ? `: ${r.data.message}` : ''}`;
  const { admin, coordinator, student } = tokens;
  const sample = (f) => fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8');

  log(`\nTesting ${BASE}\n`);
  log('--- Req 16-17: academic terms ---');
  const TERM = {
    academic_year: '2030/2031', season: 'SUMMER',
    term_start: '2031-07-01', teaching_start: '2031-07-05', teaching_end: '2031-08-25', term_end: '2031-08-31',
    advising_deadline: '2031-07-03T21:59:00Z', swap_deadline: '2031-07-02T21:59:00Z',
  };
  let r = await call('POST', '/api/terms', admin, TERM);
  check('Req 16  administrator creates a term with all six dates', r.status === 201 && r.data.term?.name === 'Summer 2030/2031', why(r));
  const termId = r.data.term?._id;
  r = await call('POST', '/api/terms', admin, TERM);
  check('Req 16  the same term cannot be created twice (409)', r.status === 409, why(r));
  r = await call('POST', '/api/terms', admin, { ...TERM, season: 'WINTER', teaching_end: '2031-12-31' });
  check('Req 16  teaching outside the term dates is refused (400)', r.status === 400 && r.data.errors?.teaching_end, why(r));
  r = await call('POST', '/api/terms', coordinator, { ...TERM, season: 'SPRING' });
  check('Req 16  only the administrator can create terms (403)', r.status === 403, why(r));
  if (termId) {
    r = await call('PUT', `/api/terms/${termId}`, admin, { advising_deadline: '2031-07-04T21:59:00Z' });
    check('Req 17  administrator updates the advising deadline', r.status === 200 && r.data.term?.advising_deadline?.startsWith('2031-07-04'), why(r));
    r = await call('PUT', `/api/terms/${termId}`, admin, { swap_deadline: '2032-01-01' });
    check('Req 17  a deadline after the term end is refused (400)', r.status === 400, why(r));
  }
  r = await call('GET', '/api/terms', admin);
  check('Req 16-17  list terms with open/closed status', r.status === 200 && r.data.terms?.every((t) => t.status), why(r));
  if (r.status === 200) log(`        ${r.data.terms.map((t) => `${t.name}: advising ${t.status.advisingOpen ? 'open' : 'closed'}`).join(' | ')}`);
  r = await call('GET', '/api/terms/current', student);
  check('Req 16-17  any user can see the current term', r.status === 200, why(r));

  log('\n--- Req 18-21: course catalogue ---');
  r = await call('GET', '/api/catalogue/courses', admin);
  check('Req 19  view the catalogue', r.status === 200 && r.data.total >= 76, why(r));
  const startCount = r.data.total;
  if (r.status === 200) log(`        ${r.data.total} courses (${r.data.courses.filter((c) => c.course_type === 'ELECTIVE').length} electives)`);
  r = await call('GET', '/api/catalogue/courses?major=DMET&type=CORE&semester=6', admin);
  check('Req 19  filter by major, type and semester', r.status === 200 && r.data.courses.every((c) => c.majors.includes('DMET') && c.course_type === 'CORE' && c.recommended_semester === 6), why(r));
  r = await call('GET', `/api/catalogue/courses/${enc('CSEN 301')}`, admin);
  check('Req 19  course details with prerequisites', r.status === 200 && r.data.prerequisiteDetails?.length === 2, why(r));
  r = await call('GET', '/api/catalogue/courses', student);
  check('Req 19  students cannot open the catalogue admin page (403)', r.status === 403, why(r));

  const NEW = { course_code: 'CSEN 1099', course_name: 'Smoke Test Course', credit_hours: 4, course_type: 'ELECTIVE',
    majors: ['CS', 'DMET'], recommended_semester: 9, offering_season: 'BOTH', prerequisites: ['CSEN 301'] };
  r = await call('POST', '/api/catalogue/courses', admin, NEW);
  check('Req 18  create a course', r.status === 201, why(r));
  r = await call('POST', '/api/catalogue/courses', admin, NEW);
  check('Req 18  duplicate code refused (409)', r.status === 409, why(r));
  r = await call('POST', '/api/catalogue/courses', admin, { ...NEW, course_code: 'CSEN 1098', credit_hours: 0, prerequisites: ['XYZ 101'] });
  check('Req 18  invalid hours and unknown prerequisite refused (400)', r.status === 400 && r.data.errors?.credit_hours && r.data.errors?.prerequisites, why(r));
  r = await call('PUT', `/api/catalogue/courses/${enc('CSEN 1099')}`, admin, { course_name: 'Smoke Test Course (edited)', credit_hours: 6 });
  check('Req 20  update a course', r.status === 200 && r.data.course?.credit_hours === 6, why(r));
  r = await call('PUT', `/api/catalogue/courses/${enc('CSEN 102')}`, admin, { prerequisites: ['CSEN 301'] });
  check('Req 20  prerequisite loop refused (400)', r.status === 400, why(r));
  r = await call('DELETE', `/api/catalogue/courses/${enc('CSEN 301')}`, admin);
  check('Req 21  a course other courses need cannot be deleted (409)', r.status === 409, why(r));
  r = await call('DELETE', `/api/catalogue/courses/${enc('CSEN 1099')}`, admin);
  check('Req 21  delete a course', r.status === 200, why(r));
  r = await call('GET', `/api/catalogue/courses/${enc('CSEN 1099')}`, admin);
  check('Req 21  deleted course is gone (404)', r.status === 404, why(r));

  log('\n--- Req 128: CSV import ---');
  r = await call('POST', '/api/catalogue/courses/import', admin, { csv: sample('sample-courses-invalid.csv') });
  check('Req 128  invalid file shows row-level errors (422)', r.status === 422 && r.data.errors?.length > 0, why(r));
  if (r.status === 422) r.data.errors.slice(0, 4).forEach((e) => log(`        row ${e.row}, ${e.column || 'file'}: ${e.message}`));
  r = await call('GET', '/api/catalogue/courses', admin);
  check('Req 128  nothing was imported from the invalid file', r.data.total === startCount, `total ${r.data.total} vs ${startCount}`);
  const original1061 = (await call('GET', `/api/catalogue/courses/${enc('CSEN 1061')}`, admin)).data.course;
  r = await call('POST', '/api/catalogue/courses/import', admin, { csv: sample('sample-courses.csv'), dryRun: true });
  check('Req 128  "check file" validates without saving', r.status === 200 && r.data.dryRun && r.data.rows?.length === 4, why(r));
  r = await call('POST', '/api/catalogue/courses/import', admin, { csv: sample('sample-courses.csv') });
  check('Req 128  import creates new codes and updates existing ones', r.status === 200 && r.data.created + r.data.updated === 4, why(r));
  if (r.status === 200) log(`        ${r.data.message}`);
  r = await call('POST', '/api/catalogue/courses/import', admin, { csv: sample('sample-courses.csv') });
  check('Req 128  importing again creates no duplicates', r.status === 200 && r.data.created === 0, why(r));
  r = await call('POST', '/api/catalogue/courses/import', coordinator, { csv: sample('sample-courses.csv') });
  check('Req 128  only the administrator can import (403)', r.status === 403, why(r));

  log('\n--- Security ---');
  r = await call('GET', '/api/catalogue/courses');
  check('no token is refused (401)', r.status === 401, why(r));

  // ---- clean up what the test created
  for (const code of ['CSEN 1067', 'CSEN 1068', 'DMET 1065']) await call('DELETE', `/api/catalogue/courses/${enc(code)}`, admin);
  if (original1061) {
    const { course_name, credit_hours, course_type, majors, recommended_semester, offering_season, prerequisites } = original1061;
    await call('PUT', `/api/catalogue/courses/${enc('CSEN 1061')}`, admin, { course_name, credit_hours, course_type, majors, recommended_semester, offering_season, prerequisites });
  }
  if (termId && removeTerm) await removeTerm(termId);
  log('        (test term and test courses removed)');

  log(`\n${passed} passed, ${failed} failed`);
  return { passed, failed };
}

/** Logs in through Person 1's POST /api/auth/login and returns the token. */
async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN || BASE },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status !== 200) throw new Error(`Login as ${email} failed (status ${res.status}): ${data.message || ''}`);
  return data.token;
}

async function main() {
  const mongoose = require('mongoose');
  const bcrypt = require('bcryptjs');
  const User = require('../models/User');
  const AuthSession = require('../models/AuthSession');
  const AcademicTerm = require('../models/AcademicTerm');
  try { await fetch(BASE); } catch {
    console.log(`Cannot reach ${BASE}. Start the server first in another window:  npm run dev`);
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/guc_schedule');
  // Temporary test users (one per role), removed at the end. Real users come from the team seed.
  const password = `Smoke-${randomUUID()}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const accounts = {
    admin: ['ADMIN', 'smoke.admin@guc.edu.eg'],
    coordinator: ['COORDINATOR', 'smoke.coordinator@guc.edu.eg'],
    student: ['STUDENT', 'smoke.student@student.guc.edu.eg'],
  };
  const ids = [];
  let failed = 1;
  try {
    const tokens = {};
    for (const [key, [role, guc_email]] of Object.entries(accounts)) {
      const user = await User.findOneAndUpdate(
        { guc_email },
        { $set: { full_name: `Smoke ${role}`, role, account_status: 'ACTIVE', password_hash: passwordHash }, $setOnInsert: { _id: randomUUID() } },
        { upsert: true, returnDocument: 'after' }
      ).lean();
      ids.push(user._id);
      tokens[key] = await login(guc_email, password);
    }
    ({ failed } = await runSmoke({ tokens, removeTerm: (id) => AcademicTerm.deleteOne({ _id: id }) }));
  } catch (e) {
    console.log(`\n${e.message}`);
    if (/429/.test(e.message)) console.log('Too many logins in 15 minutes (Person 1\'s login limit). Wait 15 minutes and run it again.');
  } finally {
    await AuthSession.deleteMany({ user_id: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  }
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { runSmoke };
