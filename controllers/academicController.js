// Person 4 — Req 57 (student submits scheduling preferences), 58 (advisor/coordinator views them),
// 61 (failed and unattended courses as mandatory candidates).
// Academic history / transcripts (Req 54-56) belong to Person 8 and are not here.
const StudentProfile = require('../models/StudentProfile');
const SchedulingPreference = require('../models/SchedulingPreference');
const AcademicRecord = require('../models/AcademicRecord');
const { HttpError } = require('../services/httpError');
const { assertBeforeDeadline } = require('../services/termRules');

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_TYPES = ['PREFERRED_DAY', 'AVOIDED_DAY', 'DAY_OFF'];
const RANGE_TYPES = ['PREFERRED_TIME_RANGE', 'AVOIDED_TIME_RANGE'];
const TIME_RANGE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/; // "09:00-12:00"
const MAX_PREFERENCES = 30;

// Returns { value } or { error } for one preference item.
function checkValue(type, raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { error: 'A value is required.' };
  if (DAY_TYPES.includes(type)) {
    const day = DAYS.find((d) => d.toLowerCase() === value.toLowerCase());
    return day ? { value: day } : { error: `Use a day name (${DAYS.join(', ')}).` };
  }
  if (RANGE_TYPES.includes(type)) {
    const m = TIME_RANGE.exec(value);
    if (!m) return { error: 'Use a time range like 09:00-12:00.' };
    if (`${m[1]}${m[2]}` >= `${m[3]}${m[4]}`) return { error: 'The start time must be before the end time.' };
    return { value };
  }
  if (type === 'NOTE') return value.length <= 500 ? { value } : { error: 'A note can be at most 500 characters.' };
  return value.length <= 50 ? { value } : { error: 'A group can be at most 50 characters.' }; // PREFERRED_GROUP
}

function parsePreferences(list) {
  if (!Array.isArray(list)) throw new HttpError(400, 'Send {"preferences": [...]} (an empty list clears your preferences).');
  if (list.length > MAX_PREFERENCES) throw new HttpError(400, `You can submit at most ${MAX_PREFERENCES} preferences.`);
  const errors = {};
  const docs = [];
  list.forEach((item, i) => {
    const type = item?.type;
    if (!SchedulingPreference.PREFERENCE_TYPES.includes(type)) {
      errors[i] = `type must be one of ${SchedulingPreference.PREFERENCE_TYPES.join(', ')}.`;
      return;
    }
    const checked = checkValue(type, item.value);
    if (checked.error) { errors[i] = checked.error; return; }
    const priority = item.priority === undefined ? i + 1 : item.priority;
    if (!Number.isInteger(priority) || priority < 1) { errors[i] = 'priority must be a whole number of 1 or more.'; return; }
    docs.push({ preference_type: type, value: checked.value, priority });
  });
  if (Object.keys(errors).length) throw new HttpError(400, 'Some preferences are not valid.', { errors });
  if (docs.filter((d) => d.preference_type === 'NOTE').length > 1) throw new HttpError(400, 'Only one note is allowed.');
  return docs;
}

const present = (rows) => ({
  preferences: rows.map((r) => ({ type: r.preference_type, value: r.value, priority: r.priority, updated_at: r.updated_at })),
  last_updated: rows.reduce((latest, r) => (!latest || r.updated_at > latest ? r.updated_at : latest), null),
});
const loadPreferences = (studentId) => SchedulingPreference.find({ student_id: studentId }).sort({ priority: 1, created_at: 1 }).lean();

// Req 57 — the student sends the whole list; it replaces what they submitted before.
async function updateMyPreferences(req, res) {
  const profile = await StudentProfile.findById(req.user._id).lean();
  if (!profile) throw new HttpError(404, 'Student profile not found.');
  if (profile.student_type !== 'ADVISING') throw new HttpError(403, 'Only Advising Students submit scheduling preferences.');
  await assertBeforeDeadline('advising'); // 403 after the advising deadline (Person 5's term rules)
  const docs = parsePreferences(req.body?.preferences);

  // Insert the new set first, then drop the old rows, so a failure cannot leave the student with nothing.
  const inserted = await SchedulingPreference.insertMany(docs.map((d) => ({ ...d, student_id: profile._id })));
  await SchedulingPreference.deleteMany({ student_id: profile._id, _id: { $nin: inserted.map((d) => d._id) } });
  res.json(present(await loadPreferences(profile._id)));
}

async function getMyPreferences(req, res) {
  const profile = await StudentProfile.findById(req.user._id).lean();
  if (!profile) throw new HttpError(404, 'Student profile not found.');
  if (profile.student_type !== 'ADVISING') throw new HttpError(403, 'Only Advising Students submit scheduling preferences.');
  res.json(present(await loadPreferences(profile._id)));
}

// Any Advisor or Coordinator may open any advising student, including students assigned to another
// Advisor (the same rule as the advisor student directory, Req 50-53, that Req 58 and 61 depend on).
async function loadViewableStudent(req) {
  const profile = await StudentProfile.findById(req.params.studentId).lean();
  if (!profile) throw new HttpError(404, 'Student not found.');
  if (profile.student_type !== 'ADVISING') throw new HttpError(400, 'This is not an Advising Student.');
  return profile;
}

// Req 58 — latest preferences, in priority order, with the last update time. No preferences is not an error.
async function getStudentPreferences(req, res) {
  const profile = await loadViewableStudent(req);
  const view = present(await loadPreferences(profile._id));
  res.json({ student_id: profile._id, submitted: view.preferences.length > 0, ...view });
}

// Req 61 — failed and unattended courses; mandatory unless an approved removal applies.
// A course the student has since passed (a COMPLETED record) is no longer outstanding.
async function getFailedAndUnattended(req, res) {
  const profile = await loadViewableStudent(req);
  const records = await AcademicRecord.find({ student_id: profile._id }).sort({ academic_year: 1, course_code: 1 }).lean();
  const passed = new Set(records.filter((r) => r.status === 'COMPLETED').map((r) => r.course_code));
  const rows = records.filter((r) => r.status !== 'COMPLETED' && !passed.has(r.course_code));
  res.json({
    student_id: profile._id,
    courses: rows.map((r) => ({ course_code: r.course_code, status: r.status, grade: r.grade ?? null,
      semester_taken: r.semester_taken ?? null, academic_year: r.academic_year ?? null,
      mandatory: !r.removal_approved })),
  });
}

module.exports = { updateMyPreferences, getMyPreferences, getStudentPreferences, getFailedAndUnattended };
