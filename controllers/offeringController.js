// Req 22: create a course offering and its lecture, tutorial and lab slots
// Req 23: view the offerings of an academic term and open one to see all its details and slots
// Req 25: update an offering or one of its slots
// Req 26: delete an offering or one of its slots
// Req 27: publish or unpublish the offerings of a term
//
// An offering is a catalogue course (Req 18-21) delivered in one academic term (Req 16-17).
// Remaining capacity is always calculated, never stored. Rules live in services/offeringRules.js.
const CourseOffering = require('../models/CourseOffering');
const Course = require('../models/Course');
const AcademicTerm = require('../models/AcademicTerm');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const GroupAssignment = require('../models/GroupAssignment');
const { normalizeCode } = require('../services/courseRules');
const {
  validateOffering, validateGroup, findClashes, publishBlocker, withRemaining,
  duplicateGroupNumber, slotLabel, DAYS, DAY_LABEL, GUC_SLOTS, GROUP_TYPES, TYPE_LABEL, MAJORS,
} = require('../services/offeringRules');
const { resolveEntries, timetableClashes } = require('../services/templateRules');
const { HttpError } = require('../services/httpError');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byCourse = (a, b) => a.course_code.localeCompare(b.course_code);

async function getTerm(termId) {
  const term = termId ? await AcademicTerm.findById(String(termId)).lean() : null;
  if (!term) throw new HttpError(404, 'Academic term not found', { errors: { term_id: 'Choose an academic term' } });
  return term;
}

async function getOfferingOr404(id) {
  const offering = await CourseOffering.findById(String(id)).lean();
  if (!offering) throw new HttpError(404, 'Course offering not found');
  return offering;
}

/** Refuses the save when the groups clash with another offering of the same term (Req 22, 25). */
async function assertNoClashes(offering) {
  const others = await CourseOffering.find({ term_id: offering.term_id }).lean();
  const clashes = findClashes(offering, others);
  // The full list travels under `errors`, which is the key services/httpError.js forwards.
  if (clashes.length) throw new HttpError(409, clashes[0], { errors: { clashes } });
}

/**
 * Where this offering is already used. Req 26 refuses to delete what is in use and Req 27
 * refuses to unpublish it, because that would invalidate a schedule that is already built.
 */
async function usageOf(offering) {
  const templates = await ScheduleTemplate.find({ 'entries.offering_id': offering._id }).lean();
  const seated = (offering.groups || []).reduce((n, g) => n + Number(g.assigned_count || 0), 0);
  let students = 0;
  for (const t of templates) students += await GroupAssignment.countDocuments({ template_id: t._id });
  return {
    templates,
    students,
    seated,
    describe: () => templates.map((t) => `${t.major} semester ${t.semester} group ${t.study_group}`).join(', '),
  };
}

// ---------------------------------------------------------------- Req 23: read

// GET /api/offerings?term_id=&search=&major=&semester=&published=&day=
async function listOfferings(req, res, next) {
  try {
    const q = req.query;
    const filter = {};
    if (q.term_id) filter.term_id = String(q.term_id);
    if (q.search) {
      const rx = new RegExp(escapeRegex(String(q.search).trim()), 'i');
      filter.$or = [{ course_code: rx }, { course_name: rx }, { instructors: rx }];
    }
    const eligible = {};
    if (q.major && MAJORS.includes(String(q.major).toUpperCase())) eligible.major = String(q.major).toUpperCase();
    if (q.semester) eligible.semester = Number(q.semester);
    if (Object.keys(eligible).length) filter.eligible_groups = { $elemMatch: eligible };
    if (q.published === 'true' || q.published === 'false') filter.is_published = q.published === 'true';

    const offerings = (await CourseOffering.find(filter).lean()).sort(byCourse).map(withRemaining);
    res.json({
      offerings,
      total: offerings.length,
      published: offerings.filter((o) => o.is_published).length,
    });
  } catch (err) { next(err); }
}

// GET /api/offerings/:id   (Req 23) — one offering with all of its slots
async function getOffering(req, res, next) {
  try {
    const offering = await getOfferingOr404(req.params.id);
    const [term, course, usage] = await Promise.all([
      AcademicTerm.findById(offering.term_id).lean(),
      Course.findOne({ course_code: offering.course_code }).lean(),
      usageOf(offering),
    ]);
    res.json({
      offering: withRemaining(offering),
      term,
      course,
      usedBy: {
        templates: usage.templates.map((t) => ({
          _id: t._id, major: t.major, semester: t.semester, study_group: t.study_group, is_published: t.is_published,
        })),
        students: usage.students,
      },
    });
  } catch (err) { next(err); }
}

// GET /api/offerings/options?term_id=   — everything the create/edit form needs
async function getOptions(req, res, next) {
  try {
    const terms = (await AcademicTerm.find({}).lean())
      .sort((a, b) => new Date(b.term_start) - new Date(a.term_start));
    const termId = String(req.query.term_id || terms[0]?._id || '');
    const [courses, offerings] = await Promise.all([
      Course.find({}).lean(),
      termId ? CourseOffering.find({ term_id: termId }).lean() : [],
    ]);
    const offered = new Set(offerings.map((o) => o.course_code));
    const rooms = [...new Set(offerings.flatMap((o) => (o.groups || []).map((g) => g.room)))].sort();
    res.json({
      terms,
      // A course already offered this term cannot be offered twice (Req 22).
      courses: courses
        .map((c) => ({
          course_code: c.course_code, course_name: c.course_name, credit_hours: c.credit_hours,
          course_type: c.course_type, majors: c.majors, curriculum: c.curriculum,
          recommended_semester: c.recommended_semester, already_offered: offered.has(c.course_code),
        }))
        .sort(byCourse),
      days: DAYS.map((d) => ({ value: d, label: DAY_LABEL[d] })),
      groupTypes: GROUP_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] })),
      gucSlots: GUC_SLOTS,
      majors: MAJORS,
      rooms,
    });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------- Req 22: create

// POST /api/offerings   { term_id, course_code, instructors[], eligible_groups[], groups[] }
async function createOffering(req, res, next) {
  try {
    const term = await getTerm(req.body.term_id);
    const code = normalizeCode(String(req.body.course_code ?? ''));
    const course = await Course.findOne({ course_code: code }).lean();
    if (!course) {
      throw new HttpError(404, `Course ${code || '(none)'} is not in the catalogue`, { errors: { course_code: 'Choose a course from the catalogue' } });
    }
    const clash = await CourseOffering.findOne({ term_id: term._id, course_code: course.course_code }).lean();
    if (clash) {
      throw new HttpError(409, `${course.course_code} is already offered in ${term.name}`, { errors: { course_code: `${course.course_code} is already offered in ${term.name}` }, offering_id: clash._id });
    }

    const result = validateOffering(req.body, { term, course });
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields', { errors: result.errors });

    await assertNoClashes({ _id: null, ...result.value });
    const created = await CourseOffering.create({ ...result.value, is_published: false });
    res.status(201).json({
      message: `${course.course_code} was added to ${term.name} as an unpublished draft`,
      offering: withRemaining(created.toObject ? created.toObject() : created),
    });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------- Req 25: update

// PUT /api/offerings/:id   — the term and the course cannot change; replace them by deleting
async function updateOffering(req, res, next) {
  try {
    const existing = await getOfferingOr404(req.params.id);
    if (req.body.course_code && normalizeCode(String(req.body.course_code)) !== existing.course_code) {
      throw new HttpError(400, 'The course of an offering cannot be changed. Delete it and create the other course instead.', { errors: { course_code: 'The course cannot be changed' } });
    }
    if (req.body.term_id && String(req.body.term_id) !== existing.term_id) {
      throw new HttpError(400, 'The academic term of an offering cannot be changed.', { errors: { term_id: 'The term cannot be changed' } });
    }

    const result = validateOffering(req.body, { existing });
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields', { errors: result.errors });

    // Removing a group through the offering form follows the Req 26 rule as well.
    const kept = new Set(result.value.groups.map((g) => g._id).filter(Boolean));
    const removed = (existing.groups || []).filter((g) => !kept.has(g._id));
    for (const g of removed) {
      const blocker = await slotDeleteBlocker(existing, g);
      if (blocker) throw new HttpError(409, blocker);
    }

    const next_ = { ...existing, ...result.value, term_id: existing.term_id, course_code: existing.course_code };
    await assertNoClashes(next_);
    if (existing.is_published) {
      const blocker = publishBlocker(next_);
      if (blocker) throw new HttpError(409, `${blocker} (this offering is published)`);
    }
    await assertTemplatesStillValid(next_);

    const saved = await CourseOffering.findOneAndUpdate(
      { _id: existing._id },
      { $set: { instructors: result.value.instructors, eligible_groups: result.value.eligible_groups, groups: result.value.groups } },
      { returnDocument: 'after', runValidators: true }
    ).lean();
    res.json({ message: `${existing.course_code} was updated`, offering: withRemaining(saved) });
  } catch (err) { next(err); }
}

// POST /api/offerings/:id/slots   (Req 22) — add one lecture, tutorial or lab group
async function addSlot(req, res, next) {
  try {
    const existing = await getOfferingOr404(req.params.id);
    const result = validateGroup(req.body);
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields', { errors: result.errors });

    const groups = [...(existing.groups || []), { _id: require('crypto').randomUUID(), ...result.value }];
    const duplicate = duplicateGroupNumber(groups);
    if (duplicate) {
      throw new HttpError(409, `${TYPE_LABEL[duplicate.type]} group ${duplicate.group_number} already exists in ${existing.course_code}`);
    }
    await assertNoClashes({ ...existing, groups });

    const saved = await CourseOffering.findOneAndUpdate(
      { _id: existing._id }, { $set: { groups } }, { returnDocument: 'after', runValidators: true }
    ).lean();
    res.status(201).json({
      message: `${slotLabel(result.value)} was added to ${existing.course_code}`,
      offering: withRemaining(saved),
    });
  } catch (err) { next(err); }
}

// PUT /api/offerings/:id/slots/:slotId   (Req 25)
async function updateSlot(req, res, next) {
  try {
    const existing = await getOfferingOr404(req.params.id);
    const old = (existing.groups || []).find((g) => g._id === req.params.slotId);
    if (!old) throw new HttpError(404, 'This slot is not part of the offering');

    const result = validateGroup(req.body, old);
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields', { errors: result.errors });

    const groups = (existing.groups || []).map((g) => (g._id === old._id ? { ...result.value, _id: old._id } : g));
    const duplicate = duplicateGroupNumber(groups);
    if (duplicate) {
      throw new HttpError(409, `${TYPE_LABEL[duplicate.type]} group ${duplicate.group_number} already exists in ${existing.course_code}`);
    }
    const next_ = { ...existing, groups };
    await assertNoClashes(next_);
    await assertTemplatesStillValid(next_);

    const saved = await CourseOffering.findOneAndUpdate(
      { _id: existing._id }, { $set: { groups } }, { returnDocument: 'after', runValidators: true }
    ).lean();
    res.json({ message: `${slotLabel(result.value)} was updated`, offering: withRemaining(saved) });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------- Req 26: delete

/** Why this slot cannot be deleted, or null. */
async function slotDeleteBlocker(offering, slot) {
  if (Number(slot.assigned_count || 0) > 0) {
    return `${slot.assigned_count} student(s) are assigned to ${offering.course_code} ${slotLabel(slot)}. Move them to another group first.`;
  }
  const templates = await ScheduleTemplate.find({ 'entries.slot_ids': slot._id }).lean();
  if (templates.length) {
    const where = templates.map((t) => `${t.major} semester ${t.semester} group ${t.study_group}`).join(', ');
    return `${offering.course_code} ${slotLabel(slot)} is used by the standard schedule of ${where}. Remove it there first.`;
  }
  return null;
}

// DELETE /api/offerings/:id/slots/:slotId   (Req 26)
async function deleteSlot(req, res, next) {
  try {
    const existing = await getOfferingOr404(req.params.id);
    const slot = (existing.groups || []).find((g) => g._id === req.params.slotId);
    if (!slot) throw new HttpError(404, 'This slot is not part of the offering');

    const blocker = await slotDeleteBlocker(existing, slot);
    if (blocker) throw new HttpError(409, blocker);

    const groups = (existing.groups || []).filter((g) => g._id !== slot._id);
    if (existing.is_published && !groups.length) {
      throw new HttpError(409, `${existing.course_code} is published, so its last slot cannot be deleted. Unpublish it first.`);
    }
    const saved = await CourseOffering.findOneAndUpdate(
      { _id: existing._id }, { $set: { groups } }, { returnDocument: 'after' }
    ).lean();
    res.json({ message: `${slotLabel(slot)} was deleted from ${existing.course_code}`, offering: withRemaining(saved) });
  } catch (err) { next(err); }
}

// DELETE /api/offerings/:id   (Req 26)
async function deleteOffering(req, res, next) {
  try {
    const existing = await getOfferingOr404(req.params.id);
    const usage = await usageOf(existing);
    if (usage.seated > 0) {
      throw new HttpError(409, `${usage.seated} student assignment(s) still use ${existing.course_code}. Move them to another group first.`);
    }
    if (usage.templates.length) {
      throw new HttpError(409, `${existing.course_code} is used by the standard schedule of ${usage.describe()}. Remove it there first.`);
    }
    await CourseOffering.deleteOne({ _id: existing._id });
    res.json({ message: `${existing.course_code} was removed from ${existing.season} ${existing.academic_year}` });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------- Req 27: publish

/** After a change to a published offering, every standard schedule using it must still hold. */
async function assertTemplatesStillValid(offering) {
  const templates = await ScheduleTemplate.find({ 'entries.offering_id': offering._id }).lean();
  if (!templates.length) return;
  const others = await CourseOffering.find({ term_id: offering.term_id }).lean();
  const byId = new Map(others.map((o) => [o._id, o]));
  byId.set(offering._id, offering); // the version being saved

  for (const template of templates) {
    const { slots, missing } = resolveEntries(template.entries, byId);
    const where = `${template.major} semester ${template.semester} group ${template.study_group}`;
    if (!(offering.eligible_groups || []).some(g => g.major === template.major && Number(g.semester) === Number(template.semester))) {
      throw new HttpError(409, `${offering.course_code} must remain eligible for ${where} while that template uses it.`);
    }
    if (missing.length) throw new HttpError(409, `${missing[0]} — it is used by the standard schedule of ${where}`);
    const clashes = timetableClashes(slots);
    if (clashes.length) throw new HttpError(409, `This change clashes in the standard schedule of ${where}: ${clashes[0]}`);
  }
}

// PUT /api/offerings/:id/publication   { published: true|false }   (Req 27)
async function setPublication(req, res, next) {
  try {
    const existing = await getOfferingOr404(req.params.id);
    const published = req.body.published === true || req.body.published === 'true';
    const message = await applyPublication(existing, published);
    const saved = await CourseOffering.findOneAndUpdate(
      { _id: existing._id }, { $set: { is_published: published } }, { returnDocument: 'after' }
    ).lean();
    res.json({ message, offering: withRemaining(saved) });
  } catch (err) { next(err); }
}

/** The shared publish/unpublish checks. Throws when the change is not allowed. */
async function applyPublication(offering, published) {
  if (published) {
    const blocker = publishBlocker(offering);
    if (blocker) throw new HttpError(409, `${offering.course_code}: ${blocker.toLowerCase()}`);
    return `${offering.course_code} is now published and can be used in schedules`;
  }
  // Unpublishing is blocked when it would invalidate a schedule that already exists (Req 27).
  const usage = await usageOf(offering);
  if (usage.students > 0) {
    throw new HttpError(409, `${offering.course_code} cannot be unpublished: ${usage.students} student(s) already have a processed schedule that uses it`);
  }
  if (usage.templates.some((t) => t.is_published)) {
    throw new HttpError(409, `${offering.course_code} cannot be unpublished: it is in the published standard schedule of ${usage.describe()}`);
  }
  return `${offering.course_code} is now unpublished and will not appear in new schedules`;
}

// PUT /api/offerings/publication   { term_id, published, offering_ids? }   (Req 27, a whole term)
async function setTermPublication(req, res, next) {
  try {
    const term = await getTerm(req.body.term_id);
    const published = req.body.published === true || req.body.published === 'true';
    const ids = Array.isArray(req.body.offering_ids) ? req.body.offering_ids.map(String) : null;

    const all = await CourseOffering.find({ term_id: term._id }).lean();
    const chosen = (ids ? all.filter((o) => ids.includes(o._id)) : all).filter((o) => o.is_published !== published);
    if (!chosen.length) {
      return res.json({ message: `No offering in ${term.name} needed changing`, changed: 0, skipped: [] });
    }

    const skipped = [];
    let changed = 0;
    for (const offering of chosen.sort(byCourse)) {
      try {
        await applyPublication(offering, published);
        await CourseOffering.updateOne({ _id: offering._id }, { $set: { is_published: published } });
        changed += 1;
      } catch (err) {
        if (!err.status || err.status >= 500) throw err;
        skipped.push({ course_code: offering.course_code, reason: err.message });
      }
    }
    res.json({
      message: `${changed} offering(s) in ${term.name} were ${published ? 'published' : 'unpublished'}` +
        (skipped.length ? `, ${skipped.length} skipped` : ''),
      changed,
      skipped,
    });
  } catch (err) { next(err); }
}

module.exports = {
  listOfferings, getOffering, getOptions,
  createOffering, updateOffering, addSlot, updateSlot,
  deleteOffering, deleteSlot, setPublication, setTermPublication,
  // exported for the template controller and the tests
  usageOf, assertTemplatesStillValid,
};
