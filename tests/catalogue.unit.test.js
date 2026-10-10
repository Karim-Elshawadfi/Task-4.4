// Unit tests for Req 16-21 and 128 rules (no database).  node --test tests/catalogue.unit.test.js
const test = require('node:test');
const assert = require('node:assert');
const { validateTerm, termStatus } = require('../services/termRules');
const { normalizeCode, validateCourse, curriculumFor, findCycle } = require('../services/courseRules');
const { parseCsv } = require('../services/csv');
const { validateImport } = require('../services/courseImport');
const { catalogueDocs } = require('../data/curriculum');

const TERM = {
  academic_year: '2026/2027', season: 'winter',
  term_start: '2026-09-12', teaching_start: '2026-09-19', teaching_end: '2026-12-31', term_end: '2027-01-31',
  advising_deadline: '2026-10-31T23:59:00Z', swap_deadline: '2026-09-30T23:59:00Z',
};

test('Req 16: a valid term is accepted and named', () => {
  const r = validateTerm(TERM);
  assert.equal(r.ok, true);
  assert.equal(r.value.name, 'Winter 2026/2027');
  assert.equal(r.value.season, 'WINTER');
});

test('Req 16: term dates must be in a sensible order', () => {
  const r = validateTerm({ ...TERM, academic_year: '2026/2028', term_end: '2026-09-01', teaching_start: '2026-09-01', advising_deadline: '2027-05-01', swap_deadline: '' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['academic_year', 'advising_deadline', 'swap_deadline', 'term_end', 'teaching_end', 'teaching_start'].sort());
});

test('Req 17: an update keeps the stored values of fields that were not sent', () => {
  const stored = validateTerm(TERM).value;
  const r = validateTerm({ advising_deadline: '2026-11-15T23:59:00Z' }, stored);
  assert.equal(r.ok, true);
  assert.equal(r.value.advising_deadline.toISOString(), '2026-11-15T23:59:00.000Z');
  assert.equal(r.value.term_start.toISOString(), stored.term_start.toISOString());
});

test('Req 16-17: actions are blocked after their deadline', () => {
  const t = validateTerm(TERM).value;
  assert.deepEqual(termStatus(t, new Date('2026-10-10')), { phase: 'RUNNING', teaching: true, advisingOpen: true, swapOpen: false });
  assert.equal(termStatus(t, new Date('2026-11-01')).advisingOpen, false);
  assert.equal(termStatus(t, new Date('2026-08-01')).phase, 'UPCOMING');
});

test('Req 18: course codes are normalised', () => {
  assert.equal(normalizeCode('csen301'), 'CSEN 301');
  assert.equal(normalizeCode('  HUMA   1001 '), 'HUMA 1001');
  assert.equal(normalizeCode('CHEMp102'), 'CHEMp 102');
  assert.equal(normalizeCode('PHYSt 301'), 'PHYSt 301');
});

test('Req 18: course validation (all fields of the requirement)', () => {
  const known = new Set(['CSEN 102', 'CSEN 202']);
  const ok = validateCourse({ course_code: 'csen 301', course_name: 'Data Structures', credit_hours: '6', course_type: 'core',
    majors: 'both', recommended_semester: '3', offering_season: 'Winter', prerequisites: 'CSEN 102; csen202' }, { knownCodes: known });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { course_code: 'CSEN 301', course_name: 'Data Structures', credit_hours: 6, course_type: 'CORE',
    majors: ['CS', 'DMET'], recommended_semester: 3, offering_season: 'WINTER', prerequisites: ['CSEN 102', 'CSEN 202'] });

  const bad = validateCourse({ course_code: 'X1', course_name: '', credit_hours: 2.5, course_type: 'lab', majors: '',
    recommended_semester: 0, offering_season: 'fall', prerequisites: 'MATH 999' }, { knownCodes: known });
  assert.deepEqual(Object.keys(bad.errors).sort(),
    ['course_code', 'course_name', 'course_type', 'credit_hours', 'majors', 'offering_season', 'prerequisites', 'recommended_semester'].sort());
  const self = validateCourse({ ...ok.value, prerequisites: ['CSEN 301'] }, { knownCodes: known });
  assert.match(self.errors.prerequisites, /own prerequisite/);
  const unknown = validateCourse({ ...ok.value, prerequisites: ['MATH 999'] }, { knownCodes: known });
  assert.match(unknown.errors.prerequisites, /not in the catalogue: MATH 999/);
});

test('curriculum placement: electives have none, DMET 502 keeps its per-major semesters', () => {
  assert.deepEqual(curriculumFor({ course_type: 'ELECTIVE', majors: ['CS'], recommended_semester: 9 }), []);
  const dmet502 = catalogueDocs().find((c) => c.course_code === 'DMET 502');
  assert.deepEqual(curriculumFor({ course_type: 'CORE', majors: ['CS', 'DMET'], recommended_semester: 5 }, dmet502), dmet502.curriculum);
  assert.deepEqual(curriculumFor({ course_type: 'CORE', majors: ['CS'], recommended_semester: 6 }, dmet502), [{ major: 'CS', semester: 6 }]);
});

test('prerequisite loops are detected', () => {
  assert.equal(findCycle(new Map([['A', ['B']], ['B', []]])), null);
  assert.deepEqual(findCycle(new Map([['A', ['B']], ['B', ['C']], ['C', ['A']]])), ['A', 'B', 'C', 'A']);
});

test('CSV parser: quotes, commas inside quotes, CRLF, BOM and semicolon files', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n').rows, [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepEqual(parseCsv('a;b\n1;"2;3"').rows, [['a', 'b'], ['1', '2;3']]);
});

const HEADER = 'course_code,course_name,credit_hours,course_type,faculty/major,recommended_semester,offering_season,prerequisites';
const existing = [{ course_code: 'CSEN 102', prerequisites: [] }, { course_code: 'CSEN 202', prerequisites: ['CSEN 102'] }];

test('Req 128: valid file -> rows to create and update, prerequisites may point to rows in the same file', () => {
  const csv = `${HEADER}\nCSEN 301,DSA,6,core,both,3,winter,CSEN 102;CSEN 401\ncsen401,Lab,4,core,CS;DMET,4,spring,CSEN 202\nCSEN 102,Intro to CS,6,core,both,1,winter,\n`;
  const r = validateImport(csv, existing);
  assert.equal(r.ok, true);
  assert.equal(r.created, 2);
  assert.equal(r.updated, 1);
  assert.deepEqual(r.rows.map((x) => [x.course_code, x.action]), [['CSEN 301', 'create'], ['CSEN 401', 'create'], ['CSEN 102', 'update']]);
});

test('Req 128: required columns are checked first', () => {
  const r = validateImport('code,name\nCSEN 1,X', existing);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 6);
  assert.ok(r.errors.every((e) => e.row === 1 && /Missing required column/.test(e.message)));
});

test('Req 128: row-level errors, duplicates and loops; nothing is valid to import', () => {
  const csv = `${HEADER}\nCSEN 301,DSA,six,core,both,3,winter,\nCSEN 401,Lab,4,core,CS,4,spring,\nCSEN 401,Lab again,4,core,CS,4,spring,\nCSEN 102,Intro,6,core,both,1,winter,CSEN 202\n`;
  const r = validateImport(csv, existing);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => [e.row, e.column]), [[2, 'credit_hours'], [4, 'course_code']]);
  const loop = validateImport(`${HEADER}\nCSEN 102,Intro,6,core,both,1,winter,CSEN 202\n`, existing);
  assert.match(loop.errors[0].message, /loop/);
  assert.equal(validateImport('', existing).errors[0].message, 'The file is empty');
});

test('the shipped sample CSV files behave as documented', () => {
  const fs = require('fs');
  const catalogue = catalogueDocs();
  const good = validateImport(fs.readFileSync('data/sample-courses.csv', 'utf8'), catalogue);
  assert.equal(good.ok, true);
  assert.deepEqual([good.created, good.updated], [3, 1]);
  const bad = validateImport(fs.readFileSync('data/sample-courses-invalid.csv', 'utf8'), catalogue);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 6);
});
