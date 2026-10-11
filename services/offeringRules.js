// Req 22-27 rules for course offerings (pure functions, unit tested).
// A course offering is one catalogue course delivered in one academic term, with all of its
// lecture, tutorial and lab groups. Nothing here touches the database: the controller loads
// the documents and passes them in, so every rule can be tested on its own.
const { GROUP_TYPES, DAYS } = require('../models/CourseOffering');
const { MAJORS } = require('./courseRules');

const DAY_LABEL = {
  SATURDAY: 'Saturday', SUNDAY: 'Sunday', MONDAY: 'Monday',
  TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday',
};
const TYPE_LABEL = { LECTURE: 'Lecture', TUTORIAL: 'Tutorial', LAB: 'Lab' };

// The five GUC teaching slots. The form offers them as shortcuts; any other time is still
// allowed, because makeup and elective groups do not always sit in a standard slot.
const GUC_SLOTS = [
  { slot: 1, start_time: '08:15', end_time: '09:45' },
  { slot: 2, start_time: '10:00', end_time: '11:30' },
  { slot: 3, start_time: '11:45', end_time: '13:15' },
  { slot: 4, start_time: '13:30', end_time: '15:00' },
  { slot: 5, start_time: '15:15', end_time: '16:45' },
];

const TIME_RX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_INDEX = Object.fromEntries(DAYS.map((d, i) => [d, i]));

/** "HH:MM" -> minutes after midnight, or null when the text is not a time. */
function toMinutes(time) {
  const m = TIME_RX.exec(String(time ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Do two groups sit on the same day at the same time? Touching ends (10:00-11:30, 11:30-13:00) do not. */
function groupsOverlap(a, b) {
  if (a.day !== b.day) return false;
  const [aStart, aEnd, bStart, bEnd] = [a.start_time, a.end_time, b.start_time, b.end_time].map(toMinutes);
  if ([aStart, aEnd, bStart, bEnd].some((v) => v === null)) return false;
  return aStart < bEnd && bStart < aEnd;
}

/** Sorts groups the way a weekly timetable reads: Saturday first, then by start time. */
const byWeek = (a, b) =>
  (DAY_INDEX[a.day] ?? 9) - (DAY_INDEX[b.day] ?? 9) || toMinutes(a.start_time) - toMinutes(b.start_time);

const slotLabel = (g) =>
  `${TYPE_LABEL[g.type] ?? g.type} ${g.group_number} (${DAY_LABEL[g.day] ?? g.day} ${g.start_time}-${g.end_time})`;

/** Remaining capacity is calculated, never stored (Req 22). */
const remainingOf = (g) => Math.max(Number(g.max_capacity || 0) - Number(g.assigned_count || 0), 0);

const sameRoom = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** Adds the calculated fields the API returns for one offering. */
function withRemaining(offering) {
  const groups = (offering.groups || [])
    .map((g) => ({ ...g, remaining_capacity: remainingOf(g), label: slotLabel(g) }))
    .sort(byWeek);
  return {
    ...offering,
    groups,
    total_capacity: groups.reduce((n, g) => n + Number(g.max_capacity || 0), 0),
    total_assigned: groups.reduce((n, g) => n + Number(g.assigned_count || 0), 0),
  };
}

/** The first (type, group number) that appears twice in one offering, or null. */
function duplicateGroupNumber(groups = []) {
  const seen = new Set();
  for (const g of groups) {
    const key = `${g.type}#${String(g.group_number).toUpperCase()}`;
    if (seen.has(key)) return g;
    seen.add(key);
  }
  return null;
}

/** One lecture, tutorial or lab group from the form. `assigned_count` is never taken from the client. */
function validateGroup(raw = {}, existing = null) {
  const errors = {};
  const pick = (k) => (raw[k] !== undefined ? raw[k] : existing?.[k]);

  const type = String(pick('type') ?? '').trim().toUpperCase();
  if (!GROUP_TYPES.includes(type)) errors.type = 'Choose lecture, tutorial or lab';

  const groupNumber = String(pick('group_number') ?? '').trim();
  if (!groupNumber) errors.group_number = 'Group number is required';
  else if (groupNumber.length > 10) errors.group_number = 'Group number is too long';

  const day = String(pick('day') ?? '').trim().toUpperCase();
  if (!DAYS.includes(day)) errors.day = 'Choose a teaching day (Saturday to Thursday)';

  const start = toMinutes(pick('start_time'));
  const end = toMinutes(pick('end_time'));
  if (start === null) errors.start_time = 'Use a 24-hour time such as 10:00';
  if (end === null) errors.end_time = 'Use a 24-hour time such as 11:30';
  if (start !== null && end !== null && start >= end) errors.end_time = 'The end time must be after the start time';

  const room = String(pick('room') ?? '').trim();
  if (!room) errors.room = 'Room is required';
  else if (room.length > 40) errors.room = 'Room is too long';

  const capacity = Number(pick('max_capacity'));
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    errors.max_capacity = 'Maximum capacity must be a whole number between 1 and 500';
  }

  // Req 25: an update may not drop the capacity under the students already seated.
  const assigned = Number(existing?.assigned_count ?? 0);
  if (!errors.max_capacity && capacity < assigned) {
    errors.max_capacity = `${assigned} student(s) are already assigned to this group, so the capacity cannot go below ${assigned}`;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...(existing?._id ? { _id: existing._id } : {}),
      type,
      group_number: groupNumber,
      day,
      start_time: String(pick('start_time')).trim(),
      end_time: String(pick('end_time')).trim(),
      room,
      max_capacity: capacity,
      assigned_count: assigned,
    },
  };
}

/** The offering itself. `term`/`course` are the loaded documents; the controller checks they exist. */
function validateOffering(raw = {}, { term, course, existing = null } = {}) {
  const errors = {};
  const pick = (k) => (raw[k] !== undefined ? raw[k] : existing?.[k]);

  const rawInstructors = pick('instructors');
  const instructors = [...new Set(
    (Array.isArray(rawInstructors) ? rawInstructors : String(rawInstructors ?? '').split(/[;,]/))
      .map((s) => String(s).trim())
      .filter(Boolean)
  )];
  if (instructors.some((i) => i.length > 80)) errors.instructors = 'An instructor name is too long';

  const rawGroups = Array.isArray(pick('eligible_groups')) ? pick('eligible_groups') : [];
  const eligible = [];
  for (const g of rawGroups) {
    const major = String(g?.major ?? '').trim().toUpperCase();
    const semester = Number(g?.semester);
    if (!MAJORS.includes(major)) { errors.eligible_groups = `Unknown major: ${g?.major}`; break; }
    if (!Number.isInteger(semester) || semester < 1 || semester > 10) {
      errors.eligible_groups = 'Each eligible group needs a semester between 1 and 10';
      break;
    }
    if (!eligible.some((e) => e.major === major && e.semester === semester)) eligible.push({ major, semester });
  }
  if (!errors.eligible_groups && !eligible.length) {
    errors.eligible_groups = 'Choose at least one eligible major and semester';
  }

  // Groups are optional while the offering is a draft; Req 27 refuses to publish without them.
  const groups = [];
  const groupErrors = {};
  const incoming = Array.isArray(pick('groups')) ? pick('groups') : [];
  incoming.forEach((g, i) => {
    const old = existing?.groups?.find((x) => x._id === g?._id) ?? null;
    const result = validateGroup(g, old);
    if (!result.ok) groupErrors[i] = result.errors;
    else groups.push(result.value);
  });
  if (Object.keys(groupErrors).length) errors.groups = groupErrors;

  const duplicate = duplicateGroupNumber(groups);
  if (duplicate) errors.groups_duplicate = `${TYPE_LABEL[duplicate.type]} group ${duplicate.group_number} is listed twice`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...(term ? { term_id: term._id, academic_year: term.academic_year, season: term.season } : {}),
      ...(course ? { course_id: course._id, course_code: course.course_code, course_name: course.course_name } : {}),
      instructors,
      eligible_groups: eligible,
      groups,
    },
  };
}

/**
 * Room and instructor clashes for `offering`, against every other offering in the same term
 * (Req 22, and Req 25: an update must not create a timetable conflict).
 *
 * A room cannot hold two groups at once, not even two groups of the same course.
 * An instructor is recorded per offering rather than per group, so instructor clashes are
 * only reported between DIFFERENT offerings that share an instructor name.
 *
 * @param {{_id?: string, instructors?: string[], groups: object[]}} offering  the one being saved
 * @param {object[]} othersInTerm  the stored offerings of the term, including the old copy of this one
 * @returns {string[]} one readable message per clash
 */
function findClashes(offering, othersInTerm = []) {
  const messages = [];
  const mine = offering.groups || [];
  const myInstructors = new Set((offering.instructors || []).map((i) => i.toLowerCase()));

  // Validate the proposed groups against each other, including brand new groups.
  for (let i = 0; i < mine.length; i += 1) {
    for (let j = i + 1; j < mine.length; j += 1) {
      if (sameRoom(mine[i].room, mine[j].room) && groupsOverlap(mine[i], mine[j])) {
        messages.push(`Room ${mine[i].room} is already used by overlapping groups: ${slotLabel(mine[i])} and ${slotLabel(mine[j])}`);
      }
    }
  }
  for (const other of othersInTerm) {
    // The old version may contain slots being moved/deleted in the same edit.
    if (offering._id && other._id === offering._id) continue;
    const shared = (other.instructors || []).filter((i) => myInstructors.has(i.toLowerCase()));
    for (const group of mine) {
      for (const theirs of other.groups || []) {
        if (!groupsOverlap(group, theirs)) continue;
        if (sameRoom(group.room, theirs.room)) {
          messages.push(`Room ${group.room} is already used by ${other.course_code} ${slotLabel(theirs)}`);
        }
        if (shared.length) {
          messages.push(`${shared[0]} already teaches ${other.course_code} ${slotLabel(theirs)}`);
        }
      }
    }
  }
  return [...new Set(messages)];
}

/** Req 27: what an offering still needs before it may be published; null when it may. */
function publishBlocker(offering) {
  if (!(offering.groups || []).length) return 'Add at least one lecture, tutorial or lab group before publishing';
  if (!(offering.instructors || []).length) return 'Assign at least one instructor before publishing';
  if (!(offering.eligible_groups || []).length) return 'Choose at least one eligible major and semester before publishing';
  return null;
}

module.exports = {
  GROUP_TYPES, DAYS, DAY_LABEL, TYPE_LABEL, GUC_SLOTS, MAJORS,
  toMinutes, groupsOverlap, byWeek, slotLabel, remainingOf, withRemaining,
  validateGroup, validateOffering, duplicateGroupNumber, findClashes, publishBlocker,
};
