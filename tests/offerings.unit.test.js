// Unit tests for the Req 22-30 rules. Pure functions only — no database, no HTTP.
// node --test tests/offerings.unit.test.js
const test = require('node:test');
const assert = require('node:assert');

const {
  toMinutes, groupsOverlap, withRemaining, validateGroup, validateOffering,
  duplicateGroupNumber, findClashes, publishBlocker, slotLabel, byWeek,
} = require('../services/offeringRules');
const {
  resolveEntries, timetableClashes, weeklyCalendar, validateTemplate, seatBlocker,
} = require('../services/templateRules');

const group = (over = {}) => ({
  type: 'LECTURE', group_number: '1', day: 'MONDAY', start_time: '10:00', end_time: '11:30',
  room: 'C7.01', max_capacity: 60, assigned_count: 0, ...over,
});

// ---------------------------------------------------------------- times and overlap

test('times are read as 24-hour HH:MM and anything else is rejected', () => {
  assert.equal(toMinutes('10:00'), 600);
  assert.equal(toMinutes('08:15'), 495);
  assert.equal(toMinutes('23:59'), 1439);
  for (const bad of ['24:00', '9:00', '10:60', 'ten', '', null, undefined]) {
    assert.equal(toMinutes(bad), null, `${bad} should not be a time`);
  }
});

test('two groups overlap only on the same day with shared minutes', () => {
  const a = group();
  assert.equal(groupsOverlap(a, group({ start_time: '11:00', end_time: '12:30' })), true, 'partly over');
  assert.equal(groupsOverlap(a, group({ start_time: '10:00', end_time: '11:30' })), true, 'identical');
  assert.equal(groupsOverlap(a, group({ start_time: '10:30', end_time: '11:00' })), true, 'inside');
  assert.equal(groupsOverlap(a, group({ start_time: '11:30', end_time: '13:00' })), false, 'back to back');
  assert.equal(groupsOverlap(a, group({ start_time: '08:15', end_time: '09:45' })), false, 'earlier slot');
  assert.equal(groupsOverlap(a, group({ day: 'TUESDAY' })), false, 'another day');
});

test('a week of slots reads Saturday first, then by start time', () => {
  const week = [
    group({ day: 'MONDAY', start_time: '13:30', end_time: '15:00' }),
    group({ day: 'SATURDAY', start_time: '11:45', end_time: '13:15' }),
    group({ day: 'MONDAY', start_time: '08:15', end_time: '09:45' }),
  ].sort(byWeek);
  assert.deepEqual(week.map((g) => `${g.day} ${g.start_time}`), ['SATURDAY 11:45', 'MONDAY 08:15', 'MONDAY 13:30']);
});

// ---------------------------------------------------------------- Req 22: groups

test('remaining capacity is calculated from the maximum and the assigned count', () => {
  const offering = withRemaining({ groups: [group({ max_capacity: 60, assigned_count: 25 }), group({ type: 'TUTORIAL', max_capacity: 30, assigned_count: 30 })] });
  assert.equal(offering.groups[0].remaining_capacity, 35);
  assert.equal(offering.groups[1].remaining_capacity, 0);
  assert.equal(offering.total_capacity, 90);
  assert.equal(offering.total_assigned, 55);
});

test('remaining capacity never goes below zero, even if a count drifts above the maximum', () => {
  const [g] = withRemaining({ groups: [group({ max_capacity: 10, assigned_count: 14 })] }).groups;
  assert.equal(g.remaining_capacity, 0);
});

test('a group is accepted once its type, number, day, times, room and capacity are valid', () => {
  const r = validateGroup({ type: 'lecture', group_number: ' 1 ', day: 'monday', start_time: '10:00', end_time: '11:30', room: ' C7.01 ', max_capacity: '60' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { type: 'LECTURE', group_number: '1', day: 'MONDAY', start_time: '10:00', end_time: '11:30', room: 'C7.01', max_capacity: 60, assigned_count: 0 });
});

test('a group is refused field by field when the form is wrong', () => {
  const r = validateGroup({ type: 'SEMINAR', group_number: '', day: 'FRIDAY', start_time: '25:00', end_time: 'x', room: '', max_capacity: 0 });
  assert.equal(r.ok, false);
  for (const field of ['type', 'group_number', 'day', 'start_time', 'end_time', 'room', 'max_capacity']) {
    assert.ok(r.errors[field], `expected an error on ${field}`);
  }
});

test('a group that ends before it starts is refused', () => {
  const r = validateGroup(group({ start_time: '13:00', end_time: '11:00' }));
  assert.equal(r.ok, false);
  assert.match(r.errors.end_time, /after the start time/);
});

test('Req 25: capacity cannot be pulled below the students already assigned', () => {
  const stored = { ...group({ max_capacity: 60, assigned_count: 42 }), _id: 'slot-1' };
  const refused = validateGroup({ ...stored, max_capacity: 30 }, stored);
  assert.equal(refused.ok, false);
  assert.match(refused.errors.max_capacity, /42 student/);

  const allowed = validateGroup({ ...stored, max_capacity: 42 }, stored);
  assert.equal(allowed.ok, true);
  assert.equal(allowed.value.assigned_count, 42, 'the assigned count is kept, never taken from the form');
  assert.equal(allowed.value._id, 'slot-1');
});

test('the assigned count in the request body is ignored', () => {
  const stored = { ...group({ assigned_count: 5 }), _id: 'slot-1' };
  const r = validateGroup({ ...stored, assigned_count: 999 }, stored);
  assert.equal(r.value.assigned_count, 5);
});

// ---------------------------------------------------------------- Req 22: the offering

const term = { _id: 'term-1', academic_year: '2026/2027', season: 'WINTER', name: 'Winter 2026/2027' };
const course = { _id: 'course-1', course_code: 'CSEN 301', course_name: 'Data Structures and Algorithms' };

test('an offering copies the term and course details and cleans up the instructor list', () => {
  const r = validateOffering(
    { instructors: [' Dr. Amr Hassan ', 'Dr. Amr Hassan', ''], eligible_groups: [{ major: 'cs', semester: '3' }], groups: [group()] },
    { term, course }
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.instructors, ['Dr. Amr Hassan'], 'trimmed and de-duplicated');
  assert.deepEqual(r.value.eligible_groups, [{ major: 'CS', semester: 3 }]);
  assert.equal(r.value.academic_year, '2026/2027');
  assert.equal(r.value.course_name, 'Data Structures and Algorithms');
});

test('instructors may also arrive as one typed line', () => {
  const r = validateOffering({ instructors: 'Dr. Amr Hassan; Dr. Mona Adel', eligible_groups: [{ major: 'CS', semester: 3 }] }, { term, course });
  assert.deepEqual(r.value.instructors, ['Dr. Amr Hassan', 'Dr. Mona Adel']);
});

test('an offering needs at least one eligible major and semester', () => {
  const r = validateOffering({ eligible_groups: [] }, { term, course });
  assert.equal(r.ok, false);
  assert.match(r.errors.eligible_groups, /at least one eligible major/);
  assert.equal(validateOffering({ eligible_groups: [{ major: 'MET', semester: 3 }] }, { term, course }).errors.eligible_groups, 'Unknown major: MET');
  assert.match(validateOffering({ eligible_groups: [{ major: 'CS', semester: 44 }] }, { term, course }).errors.eligible_groups, /between 1 and 10/);
});

test('the same group number cannot be listed twice for the same type', () => {
  const groups = [group(), group({ room: 'C7.02', day: 'TUESDAY' })];
  assert.ok(duplicateGroupNumber(groups));
  const r = validateOffering({ eligible_groups: [{ major: 'CS', semester: 3 }], groups }, { term, course });
  assert.equal(r.ok, false);
  assert.match(r.errors.groups_duplicate, /Lecture group 1 is listed twice/);

  // The same number on a different type is a different group and is fine.
  assert.equal(duplicateGroupNumber([group(), group({ type: 'TUTORIAL', day: 'TUESDAY' })]), null);
});

test('a bad group is reported under its position in the list', () => {
  const r = validateOffering(
    { eligible_groups: [{ major: 'CS', semester: 3 }], groups: [group(), group({ group_number: '2', room: '' })] },
    { term, course }
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.groups[1].room);
});

// ---------------------------------------------------------------- Req 22/25: clashes

const stored = (over = {}) => ({
  _id: 'other-1', course_code: 'MATH 301', instructors: ['Dr. Mona Adel'],
  groups: [{ ...group({ room: 'C7.01' }), _id: 'other-slot-1' }], ...over,
});

test('a room cannot hold two groups at the same time', () => {
  const clashes = findClashes({ _id: 'mine', instructors: ['Dr. Amr Hassan'], groups: [group()] }, [stored()]);
  assert.equal(clashes.length, 1);
  assert.match(clashes[0], /Room C7\.01 is already used by MATH 301/);
});

test('the same room at another time, or another room at the same time, is fine', () => {
  const mine = { _id: 'mine', instructors: [], groups: [group()] };
  assert.deepEqual(findClashes(mine, [stored({ groups: [{ ...group({ start_time: '13:30', end_time: '15:00' }), _id: 's' }] })]), []);
  assert.deepEqual(findClashes(mine, [stored({ groups: [{ ...group({ room: 'C7.02' }), _id: 's' }] })]), []);
});

test('an instructor cannot teach two different courses at the same time', () => {
  const clashes = findClashes(
    { _id: 'mine', instructors: ['dr. mona adel'], groups: [group({ room: 'H14' })] },
    [stored()]
  );
  assert.equal(clashes.length, 1);
  assert.match(clashes[0], /already teaches MATH 301/, 'matched by name, ignoring case');
});

test('two groups of the same course may share an instructor but not a room', () => {
  const mine = {
    _id: 'mine', instructors: ['Dr. Amr Hassan'],
    groups: [{ ...group({ room: 'C6.01' }), _id: 'old' }, { ...group({ type: 'TUTORIAL', group_number: 'T1', room: 'C6.01' }), _id: 'new' }],
  };
  const sameOffering = { _id: 'mine', course_code: 'CSEN 301', instructors: ['Dr. Amr Hassan'], groups: [{ ...group({ room: 'C6.01' }), _id: 'old' }] };
  const clashes = findClashes(mine, [sameOffering]);
  assert.equal(clashes.length, 1);
  assert.match(clashes[0], /Room C6\.01/, 'the room clashes, the shared instructor does not');
});

test('a group does not clash with its own stored copy when it is updated', () => {
  const slot = { ...group(), _id: 'slot-1' };
  const storedSelf = { _id: 'mine', course_code: 'CSEN 301', instructors: ['Dr. Amr Hassan'], groups: [slot] };
  const moved = { _id: 'mine', instructors: ['Dr. Amr Hassan'], groups: [{ ...slot, start_time: '11:45', end_time: '13:15' }] };
  assert.deepEqual(findClashes(moved, [storedSelf]), []);
});

test('Req 27: an offering cannot be published while something is missing', () => {
  assert.match(publishBlocker({ groups: [], instructors: ['x'], eligible_groups: [{}] }), /at least one lecture/);
  assert.match(publishBlocker({ groups: [group()], instructors: [], eligible_groups: [{}] }), /at least one instructor/);
  assert.match(publishBlocker({ groups: [group()], instructors: ['x'], eligible_groups: [] }), /eligible major/);
  assert.equal(publishBlocker({ groups: [group()], instructors: ['x'], eligible_groups: [{ major: 'CS', semester: 3 }] }), null);
});

test('a slot reads as a sentence a coordinator can understand', () => {
  assert.equal(slotLabel(group({ type: 'LAB', group_number: 'P2' })), 'Lab P2 (Monday 10:00-11:30)');
});

// ---------------------------------------------------------------- Req 28-30: templates

const offering = (over = {}) => ({
  _id: 'off-1', term_id: 'term-1', course_code: 'CSEN 301', course_name: 'Data Structures',
  is_published: true, eligible_groups: [{ major: 'CS', semester: 3 }],
  groups: [{ ...group(), _id: 'slot-1' }, { ...group({ type: 'TUTORIAL', group_number: 'T1', day: 'TUESDAY', room: 'C6.01', max_capacity: 25 }), _id: 'slot-2' }],
  ...over,
});
const mapOf = (...list) => new Map(list.map((o) => [o._id, o]));

test('a template shows the live slots of its offerings', () => {
  const { courses, slots, missing } = resolveEntries(
    [{ offering_id: 'off-1', course_code: 'CSEN 301', slot_ids: ['slot-1', 'slot-2'] }],
    mapOf(offering())
  );
  assert.deepEqual(missing, []);
  assert.equal(courses[0].slots.length, 2);
  assert.equal(slots[0].course_code, 'CSEN 301');
  assert.equal(slots[0].remaining_capacity, 60);
});

test('a template says so when an offering or a slot it points at is gone', () => {
  const dropped = resolveEntries([{ offering_id: 'off-1', course_code: 'CSEN 301', slot_ids: ['slot-1', 'ghost'] }], mapOf(offering()));
  assert.match(dropped.missing[0], /slot of CSEN 301 was deleted/);

  const removed = resolveEntries([{ offering_id: 'off-9', course_code: 'MATH 301', slot_ids: ['x'] }], mapOf(offering()));
  assert.match(removed.missing[0], /MATH 301 is no longer offered/);
  assert.equal(removed.courses[0].available, false);
});

test('one study group cannot be in two places at once', () => {
  const slots = [
    { ...group(), course_code: 'CSEN 301' },
    { ...group({ type: 'TUTORIAL', group_number: 'T1' }), course_code: 'MATH 301' },
  ];
  const clashes = timetableClashes(slots);
  assert.equal(clashes.length, 1);
  assert.match(clashes[0], /CSEN 301 Lecture 1 .* clashes with MATH 301 Tutorial T1/);
  assert.deepEqual(timetableClashes([slots[0]]), []);
});

test('the weekly calendar has a row for every teaching day', () => {
  const week = weeklyCalendar([{ ...group(), course_code: 'CSEN 301' }]);
  assert.equal(week.length, 6);
  assert.deepEqual(week.map((d) => d.label), ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']);
  assert.equal(week.find((d) => d.day === 'MONDAY').slots.length, 1);
  assert.equal(week.find((d) => d.day === 'SUNDAY').slots.length, 0, 'a day off stays visible and empty');
});

test('Req 28: a standard schedule needs a major, a semester and a study group', () => {
  const r = validateTemplate({ major: 'MET', semester: 99, study_group: '' }, { offeringsById: mapOf(offering()) });
  assert.equal(r.ok, false);
  assert.ok(r.errors.major && r.errors.semester && r.errors.study_group);
});

test('Req 27: an unpublished offering cannot be put in a standard schedule', () => {
  const r = validateTemplate(
    { major: 'CS', semester: 3, study_group: '1', entries: [{ offering_id: 'off-1', slot_ids: ['slot-1'] }] },
    { offeringsById: mapOf(offering({ is_published: false })) }
  );
  assert.equal(r.ok, false);
  assert.match(r.errors.entries, /not published yet/);
});

test('a course that is not open to this major and semester is refused', () => {
  const r = validateTemplate(
    { major: 'DMET', semester: 3, study_group: '1', entries: [{ offering_id: 'off-1', slot_ids: ['slot-1'] }] },
    { offeringsById: mapOf(offering()) }
  );
  assert.equal(r.ok, false);
  assert.match(r.errors.entries, /not offered to DMET semester 3/);
});

test('a standard schedule refuses a repeated course, an unknown slot and a clash', () => {
  const offeringsById = mapOf(offering(), offering({ _id: 'off-2', course_code: 'MATH 301', groups: [{ ...group({ room: 'H10' }), _id: 'slot-3' }] }));
  const base = { major: 'CS', semester: 3, study_group: '1' };

  const twice = validateTemplate({ ...base, entries: [{ offering_id: 'off-1', slot_ids: ['slot-1'] }, { offering_id: 'off-1', slot_ids: ['slot-2'] }] }, { offeringsById });
  assert.match(twice.errors.entries, /CSEN 301 is listed twice/);

  const ghost = validateTemplate({ ...base, entries: [{ offering_id: 'off-1', slot_ids: ['nope'] }] }, { offeringsById });
  assert.match(ghost.errors.entries, /no longer exists/);

  const empty = validateTemplate({ ...base, entries: [{ offering_id: 'off-1', slot_ids: [] }] }, { offeringsById });
  assert.match(empty.errors.entries, /at least one slot for CSEN 301/);

  // slot-1 and slot-3 are both Monday 10:00-11:30.
  const clash = validateTemplate({ ...base, entries: [{ offering_id: 'off-1', slot_ids: ['slot-1'] }, { offering_id: 'off-2', slot_ids: ['slot-3'] }] }, { offeringsById });
  assert.match(clash.errors.entries, /clashes with/);
});

test('a valid standard schedule keeps the course details of each entry', () => {
  const r = validateTemplate(
    { major: 'cs', semester: '3', study_group: ' 1 ', entries: [{ offering_id: 'off-1', slot_ids: ['slot-1', 'slot-2', 'slot-1'] }] },
    { offeringsById: mapOf(offering()) }
  );
  assert.equal(r.ok, true);
  assert.equal(r.value.major, 'CS');
  assert.equal(r.value.study_group, '1');
  assert.deepEqual(r.value.entries[0].slot_ids, ['slot-1', 'slot-2'], 'a slot chosen twice is kept once');
  assert.equal(r.value.entries[0].course_name, 'Data Structures');
});

test('Req 30: a student cannot be seated in a group that is full', () => {
  const full = { ...group({ max_capacity: 25, assigned_count: 25 }), course_code: 'CSEN 301', max_capacity: 25 };
  assert.match(seatBlocker([{ ...full, remaining_capacity: 0 }]), /is full \(25 seats\)/);
  assert.equal(seatBlocker([{ ...group({ max_capacity: 25, assigned_count: 24 }), course_code: 'CSEN 301' }]), null);
});
