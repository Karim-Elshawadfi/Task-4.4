// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { computeWorkflow } = require('../services/workflowStatus');
const { buildStudentQuery, buildSort, escapeRegex } = require('../controllers/studentController');

const t = (h) => new Date(2026, 9, 1, h);

test('advising student with no actions is Not Started, blocked on advisor', () => {
  const w = computeWorkflow('ADVISING', [], t(0));
  assert.equal(w.status, 'Not Started');
  assert.equal(w.blockingStep, 'Advisor drafting schedule');
  assert.deepEqual(w.updatedAt, t(0));
});

test('status comes from the LATEST action regardless of input order', () => {
  const w = computeWorkflow('ADVISING', [
    { action_type: 'STUDENT_ACCEPTED', created_at: t(3) },
    { action_type: 'DRAFT_CREATED', created_at: t(1) },
    { action_type: 'SENT_FOR_STUDENT_REVIEW', created_at: t(2) },
  ]);
  assert.equal(w.status, 'Pending Approval');
  assert.equal(w.blockingStep, 'Coordinator approval');
  assert.deepEqual(w.updatedAt, t(3));
});

test('normal-student actions ignore advising actions and vice versa', () => {
  const actions = [
    { action_type: 'SWAP_REQUESTED', created_at: t(5) },
    { action_type: 'DRAFT_CREATED', created_at: t(6) },
  ];
  assert.equal(computeWorkflow('NORMAL', actions).status, 'Swap Request Open');
  assert.equal(computeWorkflow('ADVISING', actions).status, 'Draft');
});

test('processed is not blocked', () => {
  const w = computeWorkflow('ADVISING', [{ action_type: 'SCHEDULE_PROCESSED', created_at: t(1) }]);
  assert.equal(w.blockingStep, 'None');
});

test('no params -> only students', () => {
  assert.deepEqual(buildStudentQuery({}), { 'user.role': 'STUDENT' });
});

test('search matches guc_student_id prefix, name and email, case-insensitive', () => {
  const q = buildStudentQuery({ search: ' 52-10 ' });
  const or = q.$and[1].$or;
  assert.ok(or[0].guc_student_id.test('52-1001'));
  assert.ok(!or[0].guc_student_id.test('152-10'));
  assert.ok(buildStudentQuery({ search: 'omar' }).$and[1].$or[1]['user.full_name'].test('Omar Khaled'));
  assert.ok(buildStudentQuery({ search: 'OMAR.K' }).$and[1].$or[2]['user.guc_email'].test('omar.khaled@student.guc.edu.eg'));
});

test('search input is escaped (no regex injection / crash)', () => {
  assert.doesNotThrow(() => buildStudentQuery({ search: '(*[' }));
  assert.equal(escapeRegex('a.b*'), 'a\\.b\\*');
  const rx = buildStudentQuery({ search: 'a.b' }).$and[1].$or[1]['user.full_name'];
  assert.ok(!rx.test('axb'));
});

test('sort defaults to most recently updated and whitelists fields', () => {
  assert.deepEqual(buildSort(), { last_updated: -1, _id: 1 });
  assert.deepEqual(buildSort('name'), { 'user.full_name': 1, _id: 1 });
  assert.deepEqual(buildSort('-password_hash'), { last_updated: -1, _id: 1 });
});
