// Req 28: create a standard schedule template for normal students by major, semester and study group
// Req 29: update a standard schedule template
// Req 30: assign or reassign normal students to a standard schedule group
//
// A template points at slots inside PUBLISHED course offerings (Req 22, 27), so it always
// shows their live times. Assigning a student seats them in every slot of the template:
// that is what raises `assigned_count`, which Req 25 and Req 26 then protect.
const { randomUUID } = require('crypto');
const { requireSchedulingTransaction } = require('../services/schedulingTransaction');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const CourseOffering = require('../models/CourseOffering');
const GroupAssignment = require('../models/GroupAssignment');
const AcademicTerm = require('../models/AcademicTerm');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
const { HttpError } = require('../services/httpError');
const { recordWorkflowAction } = require('../services/workflowStatus');
const { withRemaining, slotLabel, MAJORS } = require('../services/offeringRules');
const {
  resolveEntries, weeklyCalendar, validateTemplate, publishBlocker, seatBlocker,
} = require('../services/templateRules');

const groupLabel = (t) => `${t.major} semester ${t.semester} group ${t.study_group}`;
const byGroup = (a, b) =>
  a.major.localeCompare(b.major) || a.semester - b.semester || String(a.study_group).localeCompare(String(b.study_group), undefined, { numeric: true });

async function getTerm(termId) {
  const term = termId ? await AcademicTerm.findById(String(termId)).lean() : null;
  if (!term) throw new HttpError(404, 'Academic term not found', { errors: { term_id: 'Choose an academic term' } });
  return term;
}

async function getTemplateOr404(id) {
  const template = await ScheduleTemplate.findById(String(id)).lean();
  if (!template) throw new HttpError(404, 'Standard schedule not found');
  return template;
}

/** The offerings of a term, by id — what a template may choose from. */
async function offeringsOfTerm(termId) {
  const offerings = await CourseOffering.find({ term_id: termId }).lean();
  return new Map(offerings.map((o) => [o._id, o]));
}

/** A template with its slots resolved, its weekly calendar and how many students are in it. */
async function expand(template) {
  const offeringsById = await offeringsOfTerm(template.term_id);
  const { courses, slots, missing } = resolveEntries(template.entries, offeringsById);
  const students = await GroupAssignment.countDocuments({ template_id: template._id });
  return {
    ...template,
    label: groupLabel(template),
    courses,
    week: weeklyCalendar(slots),
    total_slots: slots.length,
    students,
    warnings: missing,
  };
}

// ---------------------------------------------------------------- Req 28/29: read

// GET /api/templates?term_id=&major=&semester=
async function listTemplates(req, res, next) {
  try {
    const filter = {};
    if (req.query.term_id) filter.term_id = String(req.query.term_id);
    if (req.query.major && MAJORS.includes(String(req.query.major).toUpperCase())) {
      filter.major = String(req.query.major).toUpperCase();
    }
    if (req.query.semester) filter.semester = Number(req.query.semester);

    const stored = (await ScheduleTemplate.find(filter).lean()).sort(byGroup);
    const templates = [];
    for (const template of stored) templates.push(await expand(template));
    res.json({ templates, total: templates.length });
  } catch (err) { next(err); }
}

// GET /api/templates/:id — the full weekly standard schedule and the students in the group
async function getTemplate(req, res, next) {
  try {
    const template = await getTemplateOr404(req.params.id);
    const [full, term, students] = await Promise.all([
      expand(template),
      AcademicTerm.findById(template.term_id).lean(),
      studentsOfTemplate(template._id),
    ]);
    res.json({ template: full, term, students });
  } catch (err) { next(err); }
}

// GET /api/templates/options?term_id= — published offerings and the normal students of a term
async function getOptions(req, res, next) {
  try {
    const terms = (await AcademicTerm.find({}).lean())
      .sort((a, b) => new Date(b.term_start) - new Date(a.term_start));
    const termId = String(req.query.term_id || terms[0]?._id || '');
    // Req 27: only published offerings may be used to build a schedule.
    const offerings = termId ? await CourseOffering.find({ term_id: termId, is_published: true }).lean() : [];
    res.json({
      terms,
      majors: MAJORS,
      offerings: offerings
        .map(withRemaining)
        .sort((a, b) => a.course_code.localeCompare(b.course_code)),
    });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------- Req 28: create

// POST /api/templates   { term_id, major, semester, study_group, entries: [{offering_id, slot_ids[]}] }
async function createTemplate(req, res, next) {
  try {
    const term = await getTerm(req.body.term_id);
    const offeringsById = await offeringsOfTerm(term._id);
    const result = validateTemplate(req.body, { offeringsById });
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields', { errors: result.errors });

    const clash = await ScheduleTemplate.findOne({
      term_id: term._id, major: result.value.major,
      semester: result.value.semester, study_group: result.value.study_group,
    }).lean();
    if (clash) {
      throw new HttpError(409, `A standard schedule for ${groupLabel(result.value)} already exists in ${term.name}`, { errors: { study_group: 'This group already has a standard schedule' }, template_id: clash._id });
    }

    const created = await ScheduleTemplate.create({
      term_id: term._id,
      ...result.value,
      entries: result.value.entries.map((e) => ({ _id: randomUUID(), ...e })),
      is_published: false,
    });
    const template = await expand(created.toObject ? created.toObject() : created);
    res.status(201).json({
      message: `The standard schedule for ${groupLabel(result.value)} was created as a draft`,
      template,
    });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------- Req 29: update

// PUT /api/templates/:id
async function updateTemplate(req, res, next) {
  try {
    const existing = await getTemplateOr404(req.params.id);
    if (req.body.term_id && String(req.body.term_id) !== existing.term_id) {
      throw new HttpError(400, 'The academic term of a standard schedule cannot be changed.', { errors: { term_id: 'The term cannot be changed' } });
    }
    const offeringsById = await offeringsOfTerm(existing.term_id);
    const result = validateTemplate(req.body, { offeringsById, existing });
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields', { errors: result.errors });

    const moved = result.value.major !== existing.major
      || result.value.semester !== existing.semester
      || result.value.study_group !== existing.study_group;
    if (moved) {
      const clash = await ScheduleTemplate.findOne({
        term_id: existing.term_id, major: result.value.major,
        semester: result.value.semester, study_group: result.value.study_group,
      }).lean();
      if (clash && clash._id !== existing._id) {
        throw new HttpError(409, `A standard schedule for ${groupLabel(result.value)} already exists`, { errors: { study_group: 'This group already has a standard schedule' } });
      }
    }

    const seated = await GroupAssignment.countDocuments({ template_id: existing._id });
    if (seated && moved) {
      throw new HttpError(409, `${seated} student(s) are assigned to ${groupLabel(existing)}. Move them out before changing the major, semester or group number.`);
    }
    if (existing.is_published) {
      const blocker = publishBlocker(result.value);
      if (blocker) throw new HttpError(409, `${blocker} (this standard schedule is published)`);
    }

    // Plan every release/reservation before writing. Shared slots have zero delta,
    // so moving a full group between templates that share a lecture stays valid.
    if (seated) await moveSeats(existing.entries, result.value.entries, seated);

    const entries = result.value.entries.map((e) => ({ _id: e._id || randomUUID(), ...e }));
    const saved = await ScheduleTemplate.findOneAndUpdate(
      { _id: existing._id },
      { $set: { major: result.value.major, semester: result.value.semester, study_group: result.value.study_group, entries } },
      { returnDocument: 'after', runValidators: true }
    ).lean();
    res.json({ message: `The standard schedule for ${groupLabel(saved)} was updated`, template: await expand(saved) });
  } catch (err) { next(err); }
}

// DELETE /api/templates/:id
async function deleteTemplate(req, res, next) {
  try {
    const existing = await getTemplateOr404(req.params.id);
    const seated = await GroupAssignment.countDocuments({ template_id: existing._id });
    if (seated) {
      throw new HttpError(409, `${seated} student(s) are assigned to ${groupLabel(existing)}. Move them to another group first.`);
    }
    await ScheduleTemplate.deleteOne({ _id: existing._id });
    res.json({ message: `The standard schedule for ${groupLabel(existing)} was deleted` });
  } catch (err) { next(err); }
}

// PUT /api/templates/:id/publication   { published: true|false }
async function setPublication(req, res, next) {
  try {
    const existing = await getTemplateOr404(req.params.id);
    const published = req.body.published === true || req.body.published === 'true';
    if (published) {
      const blocker = publishBlocker(existing);
      if (blocker) throw new HttpError(409, blocker);
      const offeringsById = await offeringsOfTerm(existing.term_id);
      assertCurrentTemplate(existing, offeringsById);
    } else {
      const seated = await GroupAssignment.countDocuments({ template_id: existing._id });
      if (seated) {
        throw new HttpError(409, `${seated} student(s) already follow ${groupLabel(existing)}, so it cannot be unpublished.`);
      }
    }
    const saved = await ScheduleTemplate.findOneAndUpdate(
      { _id: existing._id }, { $set: { is_published: published } }, { returnDocument: 'after' }
    ).lean();
    res.json({
      message: `The standard schedule for ${groupLabel(saved)} is now ${published ? 'published' : 'a draft'}`,
      template: await expand(saved),
    });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------- Req 30: assign students

/** Recheck mutable offering data at publication/assignment time, not only on editing. */
function assertCurrentTemplate(template, offeringsById) {
  const blocker = publishBlocker(template);
  if (blocker) throw new HttpError(409, blocker);
  const result = validateTemplate(template, { offeringsById });
  if (!result.ok) throw new HttpError(409, Object.values(result.errors)[0], { errors: result.errors });
}

/** Validate all seat deltas before writing any of them. Caller owns the transaction. */
async function moveSeats(oldEntries = [], newEntries = [], count = 1) {
  requireSchedulingTransaction();
  const deltas = new Map();
  for (const [entries, sign] of [[oldEntries, -1], [newEntries, 1]]) {
    for (const entry of entries) {
      if (!deltas.has(entry.offering_id)) deltas.set(entry.offering_id, new Map());
      const slots = deltas.get(entry.offering_id);
      for (const id of new Set(entry.slot_ids || [])) slots.set(id, (slots.get(id) || 0) + sign * count);
    }
  }
  const changes = [];
  for (const [id, slots] of deltas) {
    const offering = await CourseOffering.findById(id).lean();
    if (!offering) throw new HttpError(409, 'A scheduled offering no longer exists.');
    if ([...slots.keys()].some(slotId => !offering.groups.some(g => g._id === slotId))) {
      throw new HttpError(409, 'A scheduled slot no longer exists.');
    }
    const groups = offering.groups.map(g => {
      const delta = slots.get(g._id) || 0;
      const assigned = Number(g.assigned_count || 0);
      const nextCount = assigned + delta;
      if (nextCount < 0) throw new HttpError(409, `${offering.course_code} has inconsistent seat counts; no assignment was changed.`);
      if (nextCount > g.max_capacity) {
        const available = g.max_capacity - assigned;
        throw new HttpError(409, available <= 0
          ? `${offering.course_code} ${slotLabel(g)} is full (${g.max_capacity} seats)`
          : `${offering.course_code} ${slotLabel(g)} has ${available} seat(s) left but ${delta} are needed`);
      }
      return { ...g, assigned_count: nextCount };
    });
    changes.push({ id, groups });
  }
  // Validation above is read-only. Expected rejections can safely be skipped in a
  // batch. Any database failure below aborts the entire transaction, not one row.
  for (const { id, groups } of changes) {
    await CourseOffering.updateOne({ _id: id }, { $set: { groups } });
  }
}

/** Shared entry point for other scheduling features. Use withSchedulingTransaction. */
async function changeSeats(entries = [], delta) {
  requireSchedulingTransaction();
  if (!Number.isInteger(delta)) throw new Error('Seat delta must be an integer.');
  if (delta < 0) await moveSeats(entries, [], -delta);
  else if (delta > 0) await moveSeats([], entries, delta);
}

/** Is there room for `count` more students in every one of these slots? */
function seatBlockerFor(slots, count) {
  if (count <= 1) return seatBlocker(slots);
  const tight = slots.find((s) => Number(s.remaining_capacity ?? 0) < count);
  return tight ? `${tight.course_code} ${tight.label} has ${tight.remaining_capacity} seat(s) left but ${count} are needed` : null;
}

async function studentsOfTemplate(templateId) {
  const rows = await GroupAssignment.find({ template_id: templateId }).lean();
  const out = [];
  for (const row of rows) {
    const [user, profile] = await Promise.all([
      User.findById(row.student_id).lean(),
      StudentProfile.findById(row.student_id).lean(),
    ]);
    out.push({
      student_id: row.student_id,
      full_name: user?.full_name ?? '(deleted user)',
      guc_email: user?.guc_email ?? null,
      guc_student_id: profile?.guc_student_id ?? null,
      major: profile?.major ?? null,
      current_semester: profile?.current_semester ?? null,
      assigned_at: row.created_at,
    });
  }
  return out.sort((a, b) => String(a.guc_student_id).localeCompare(String(b.guc_student_id)));
}

/** Checks one student against the group, then seats them. Throws an HttpError when refused. */
async function assignOne(template, studentId, actorId) {
  const user = await User.findById(studentId).lean();
  const profile = await StudentProfile.findById(studentId).lean();
  if (!user || user.role !== 'STUDENT' || !profile) throw new HttpError(404, 'Student not found');
  if (profile.student_type !== 'NORMAL') {
    throw new HttpError(409, `${user.full_name} is an advising student. Standard schedule groups are for normal students.`);
  }
  if (profile.major && profile.major !== template.major) {
    throw new HttpError(409, `${user.full_name} studies ${profile.major}, not ${template.major}`);
  }
  if (profile.current_semester && Number(profile.current_semester) !== Number(template.semester)) {
    throw new HttpError(409, `${user.full_name} is in semester ${profile.current_semester}, not semester ${template.semester}`);
  }

  // Revalidate before releasing old seats; a skipped request must not change them.
  assertCurrentTemplate(template, await offeringsOfTerm(template.term_id));
  const current = await GroupAssignment.findOne({ student_id: studentId, term_id: template.term_id }).lean();
  if (current && current.template_id === template._id) {
    throw new HttpError(409, `${user.full_name} is already in ${groupLabel(template)}`);
  }

  const previous = current ? await ScheduleTemplate.findById(current.template_id).lean() : null;
  if (current && !previous) throw new HttpError(409, 'The previous schedule is missing; repair it before reassigning this student.');
  await moveSeats(previous?.entries || [], template.entries, 1);
  await GroupAssignment.findOneAndUpdate(
    { student_id: studentId, term_id: template.term_id },
    { $set: { template_id: template._id, major: template.major, semester: template.semester, study_group: template.study_group, assigned_by: actorId } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
  // Req 6: the workflow status is calculated from recorded actions, never written directly.
  await recordWorkflowAction(studentId, 'SCHEDULE_ASSIGNED', actorId,
    `Assigned to ${groupLabel(template)}`);

  return {
    student_id: studentId,
    full_name: user.full_name,
    moved_from: previous ? groupLabel(previous) : null,
  };
}

// POST /api/templates/:id/students   { student_ids: [...] }   (Req 30)
async function assignStudents(req, res, next) {
  try {
    const template = await getTemplateOr404(req.params.id);
    if (!template.is_published) {
      throw new HttpError(409, `The standard schedule for ${groupLabel(template)} is still a draft. Publish it before assigning students.`);
    }
    const ids = [...new Set((Array.isArray(req.body.student_ids) ? req.body.student_ids : [req.body.student_id]).filter(Boolean).map(String))];
    if (!ids.length) throw new HttpError(400, 'Choose at least one student', { errors: { student_ids: 'Choose at least one student' } });

    const assigned = [];
    const skipped = [];
    for (const id of ids) {
      try {
        assigned.push(await assignOne(template, id, req.user?._id));
      } catch (err) {
        if (!err.status || err.status >= 500) throw err;
        skipped.push({ student_id: id, reason: err.message });
      }
    }
    const moved = assigned.filter((a) => a.moved_from).length;
    res.json({
      message: `${assigned.length} student(s) assigned to ${groupLabel(template)}` +
        (moved ? ` (${moved} moved from another group)` : '') +
        (skipped.length ? `, ${skipped.length} skipped` : ''),
      assigned,
      skipped,
      template: await expand(await getTemplateOr404(template._id)),
    });
  } catch (err) { next(err); }
}

// DELETE /api/templates/:id/students/:studentId   (Req 30) — take a student out of the group
async function removeStudent(req, res, next) {
  try {
    const template = await getTemplateOr404(req.params.id);
    const row = await GroupAssignment.findOne({ student_id: String(req.params.studentId), template_id: template._id }).lean();
    if (!row) throw new HttpError(404, 'This student is not in this group');

    await changeSeats(template.entries, -1);
    await GroupAssignment.deleteOne({ _id: row._id });
    const user = await User.findById(row.student_id).lean();
    res.json({
      message: `${user?.full_name ?? 'The student'} was removed from ${groupLabel(template)}`,
      template: await expand(await getTemplateOr404(template._id)),
    });
  } catch (err) { next(err); }
}

// GET /api/templates/:id/candidates — normal students who may join this group (Req 30)
async function listCandidates(req, res, next) {
  try {
    const template = await getTemplateOr404(req.params.id);
    const profiles = await StudentProfile.find({
      student_type: 'NORMAL', major: template.major, current_semester: Number(template.semester),
    }).lean();

    const candidates = [];
    for (const profile of profiles) {
      const user = await User.findById(profile._id).lean();
      if (!user || user.role !== 'STUDENT') continue;
      const current = await GroupAssignment.findOne({ student_id: profile._id, term_id: template.term_id }).lean();
      candidates.push({
        student_id: profile._id,
        full_name: user.full_name,
        guc_email: user.guc_email,
        guc_student_id: profile.guc_student_id,
        account_status: user.account_status,
        current_group: current ? current.study_group : null,
        in_this_group: current ? current.template_id === template._id : false,
      });
    }
    res.json({
      candidates: candidates.sort((a, b) => String(a.guc_student_id).localeCompare(String(b.guc_student_id))),
      total: candidates.length,
    });
  } catch (err) { next(err); }
}

module.exports = {
  listTemplates, getTemplate, getOptions,
  createTemplate, updateTemplate, deleteTemplate, setPublication,
  assignStudents, removeStudent, listCandidates,
  changeSeats, seatBlockerFor,
};
