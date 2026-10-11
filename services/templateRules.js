// Req 28-30 rules for standard schedule templates (pure functions, unit tested).
// A template is the weekly schedule that every normal student of one major + semester +
// study group follows. It stores no times of its own: each entry points at slots inside a
// published course offering (Req 22), so the template always shows the offering's live times.
const { MAJORS } = require('./courseRules');
const { groupsOverlap, byWeek, slotLabel, remainingOf, DAYS, DAY_LABEL } = require('./offeringRules');

/**
 * Turns the stored entries into full slot details by looking them up in their offerings.
 * @param {object[]} entries  schedule_templates.entries
 * @param {Map<string, object>} offeringsById
 * @returns {{courses: object[], slots: object[], missing: string[]}}
 *          `slots` is every slot of the whole template, `missing` names what no longer exists.
 */
function resolveEntries(entries = [], offeringsById = new Map()) {
  const courses = [];
  const slots = [];
  const missing = [];

  for (const entry of entries) {
    const offering = offeringsById.get(entry.offering_id);
    if (!offering) {
      missing.push(`${entry.course_code || entry.offering_id} is no longer offered this term`);
      courses.push({ ...entry, slots: [], available: false });
      continue;
    }
    const byId = new Map((offering.groups || []).map((g) => [g._id, g]));
    const found = [];
    for (const id of entry.slot_ids || []) {
      const group = byId.get(id);
      if (!group) { missing.push(`A slot of ${offering.course_code} was deleted from the offering`); continue; }
      const full = {
        ...group,
        slot_id: group._id,
        offering_id: offering._id,
        course_code: offering.course_code,
        course_name: offering.course_name,
        remaining_capacity: remainingOf(group),
        label: slotLabel(group),
      };
      found.push(full);
      slots.push(full);
    }
    courses.push({
      offering_id: offering._id,
      course_code: offering.course_code,
      course_name: offering.course_name,
      instructors: offering.instructors || [],
      is_published: offering.is_published,
      slots: found.sort(byWeek),
      available: true,
    });
  }
  return { courses, slots: slots.sort(byWeek), missing: [...new Set(missing)] };
}

/** Two slots of the same template cannot sit at the same time: one student group cannot be in both. */
function timetableClashes(slots = []) {
  const messages = [];
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      if (groupsOverlap(slots[i], slots[j])) {
        messages.push(
          `${slots[i].course_code} ${slotLabel(slots[i])} clashes with ${slots[j].course_code} ${slotLabel(slots[j])}`
        );
      }
    }
  }
  return messages;
}

/** The template as a weekly calendar: one row per teaching day. */
function weeklyCalendar(slots = []) {
  return DAYS.map((day) => ({
    day,
    label: DAY_LABEL[day],
    slots: slots.filter((s) => s.day === day).sort(byWeek),
  }));
}

/**
 * Validates a template from the form.
 * @param {object} raw                       request body
 * @param {object} ctx
 * @param {Map<string, object>} ctx.offeringsById  offerings of the term, by id
 * @param {object|null} ctx.existing         the stored template, for an update
 * @returns {{ok: true, value: object} | {ok: false, errors: object}}
 */
function validateTemplate(raw = {}, { offeringsById = new Map(), existing = null } = {}) {
  const errors = {};
  const pick = (k) => (raw[k] !== undefined ? raw[k] : existing?.[k]);

  const major = String(pick('major') ?? '').trim().toUpperCase();
  if (!MAJORS.includes(major)) errors.major = `Choose a major (${MAJORS.join(' or ')})`;

  const semester = Number(pick('semester'));
  if (!Number.isInteger(semester) || semester < 1 || semester > 10) {
    errors.semester = 'Semester must be a whole number between 1 and 10';
  }

  const studyGroup = String(pick('study_group') ?? '').trim();
  if (!studyGroup) errors.study_group = 'Study group is required';
  else if (studyGroup.length > 10) errors.study_group = 'Study group is too long';

  // Entries. An empty template is a draft; Req 30 only assigns students to a published one.
  const entries = [];
  const seenCourses = new Set();
  const rawEntries = Array.isArray(pick('entries')) ? pick('entries') : [];
  for (const entry of rawEntries) {
    const offering = offeringsById.get(String(entry?.offering_id ?? ''));
    if (!offering) { errors.entries = 'One of the chosen courses is not offered in this term'; break; }
    // Req 27: only published offerings may be used to build a schedule.
    if (!offering.is_published) {
      errors.entries = `${offering.course_code} is not published yet, so it cannot be put in a standard schedule`;
      break;
    }
    if (seenCourses.has(offering.course_code)) {
      errors.entries = `${offering.course_code} is listed twice`;
      break;
    }
    seenCourses.add(offering.course_code);

    const eligible = offering.eligible_groups || [];
    if (eligible.length && !eligible.some((g) => g.major === major && Number(g.semester) === semester)) {
      errors.entries = `${offering.course_code} is not offered to ${major} semester ${semester}`;
      break;
    }

    const ids = [...new Set((Array.isArray(entry.slot_ids) ? entry.slot_ids : []).map(String))];
    const known = new Set((offering.groups || []).map((g) => g._id));
    if (!ids.length) { errors.entries = `Choose at least one slot for ${offering.course_code}`; break; }
    if (ids.some((id) => !known.has(id))) { errors.entries = `A chosen slot of ${offering.course_code} no longer exists`; break; }

    entries.push({
      ...(entry._id ? { _id: entry._id } : {}),
      offering_id: offering._id,
      course_code: offering.course_code,
      course_name: offering.course_name,
      slot_ids: ids,
    });
  }

  if (!errors.entries) {
    const { slots } = resolveEntries(entries, offeringsById);
    const clashes = timetableClashes(slots);
    if (clashes.length) errors.entries = clashes[0];
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { major, semester, study_group: studyGroup, entries } };
}

/** Req 30: what a template still needs before students may be assigned to it; null when ready. */
function publishBlocker(template) {
  if (!(template.entries || []).length) return 'Add at least one course before publishing the standard schedule';
  return null;
}

/**
 * Req 30: can one more student be seated in this template?
 * @returns {string|null} the reason not to, or null when there is room everywhere.
 */
function seatBlocker(slots = []) {
  const full = slots.find((s) => remainingOf(s) <= 0);
  return full ? `${full.course_code} ${slotLabel(full)} is full (${full.max_capacity} seats)` : null;
}

module.exports = {
  resolveEntries, timetableClashes, weeklyCalendar, validateTemplate, publishBlocker, seatBlocker,
};
