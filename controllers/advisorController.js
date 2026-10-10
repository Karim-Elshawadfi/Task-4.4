// Person 4 — Req 11 (add advisor), 12 (remove advisor), 13 (email), 14 (assign/reassign), 15 (my advisor).
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const AdvisorAssignment = require('../models/AdvisorAssignment');
const { HttpError } = require('../services/httpError');

const STAFF_EMAIL = /^[^\s@]+@guc\.edu\.eg$/; // advisors use @guc.edu.eg (students use @student.guc.edu.eg)
const cleanEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const asId = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const publicAdvisor = (u) => ({ id: u._id, full_name: u.full_name, guc_email: u.guc_email });

// An email problem must never undo the advisor change, so it is reported, not thrown.
async function sendAdvisorEmail(req, advisor, action) {
  try {
    await req.app.locals.advising.sendAdvisorEmail({ email: advisor.guc_email, full_name: advisor.full_name, action });
    return true;
  } catch (error) {
    console.error('Advisor email was not sent:', error.message);
    return false;
  }
}

async function findAdvisorByEmail(email) {
  if (!STAFF_EMAIL.test(email)) throw new HttpError(400, 'Enter a valid GUC email (name@guc.edu.eg).');
  const advisor = await User.findOne({ guc_email: email, role: 'ADVISOR' }).lean();
  if (!advisor) throw new HttpError(404, 'No advisor account exists with this GUC email.');
  return advisor;
}

// Req 11 — the advisor's credentials already exist; this puts them into the advising system.
async function addAdvisor(req, res) {
  const advisor = await findAdvisorByEmail(cleanEmail(req.body?.guc_email));
  if (advisor.account_status !== 'ACTIVE') throw new HttpError(409, 'This advisor account is deactivated.');
  if (advisor.advising_active !== false) {
    return res.json({ message: 'This advisor is already in the advising system.', already_active: true, advisor: publicAdvisor(advisor) });
  }
  await User.updateOne({ _id: advisor._id }, { $set: { advising_active: true } });
  const email_sent = await sendAdvisorEmail(req, advisor, 'ADDED'); // Req 13
  res.json({ message: 'Advisor added to the advising system.', advisor: publicAdvisor(advisor), email_sent });
}

// Req 12 — remove by GUC email. The account stays active and every past action stays in the
// schedule activity history; only the advisor's current students are unassigned.
async function removeAdvisor(req, res) {
  const advisor = await findAdvisorByEmail(cleanEmail(req.params.email));
  if (advisor.advising_active === false) throw new HttpError(409, 'This advisor is not in the advising system.');
  const now = new Date();
  await User.updateOne({ _id: advisor._id }, { $set: { advising_active: false } });
  await AdvisorAssignment.updateMany({ advisor_id: advisor._id, removed_at: null }, { $set: { removed_at: now } });
  const freed = await StudentProfile.updateMany({ assigned_advisor_id: advisor._id }, { $set: { assigned_advisor_id: null } });
  const email_sent = await sendAdvisorEmail(req, advisor, 'REMOVED'); // Req 13
  res.json({ message: 'Advisor removed from the advising system.', advisor: publicAdvisor(advisor),
    unassigned_students: freed.modifiedCount ?? 0, email_sent });
}

// Req 14 — assign or reassign. Accepts the student's id or GUC student ID, and the advisor's id or email.
async function assignAdvisor(req, res) {
  const body = req.body || {};
  const studentId = asId(body.studentId);
  const studentNumber = asId(body.guc_student_id);
  const advisorId = asId(body.advisorId);
  const advisorEmail = cleanEmail(body.advisor_email);
  if (!(studentId || studentNumber) || !(advisorId || advisorEmail)) {
    throw new HttpError(400, 'Send the student (studentId or guc_student_id) and the advisor (advisorId or advisor_email).');
  }

  const student = studentId ? await StudentProfile.findById(studentId).lean()
    : await StudentProfile.findOne({ guc_student_id: studentNumber }).lean();
  if (!student) throw new HttpError(404, 'Student not found.');
  if (student.student_type !== 'ADVISING') throw new HttpError(400, 'Only Advising Students can be assigned an advisor.');

  const advisor = advisorId ? await User.findOne({ _id: advisorId, role: 'ADVISOR' }).lean()
    : await User.findOne({ guc_email: advisorEmail, role: 'ADVISOR' }).lean();
  if (!advisor) throw new HttpError(404, 'Advisor not found.');
  if (advisor.account_status !== 'ACTIVE' || advisor.advising_active === false) {
    throw new HttpError(400, 'The chosen user is not an active advisor.');
  }
  if (student.assigned_advisor_id === advisor._id) throw new HttpError(409, 'This advisor is already assigned to the student.');

  // Close the current history row, point the profile at the new advisor, open a new history row.
  // Nothing else about the student (schedule, requests, plans) is touched.
  const now = new Date();
  await AdvisorAssignment.updateMany({ student_id: student._id, removed_at: null }, { $set: { removed_at: now } });
  await StudentProfile.updateOne({ _id: student._id }, { $set: { assigned_advisor_id: advisor._id } });
  await AdvisorAssignment.create({ student_id: student._id, advisor_id: advisor._id, assigned_by: req.user._id, assigned_at: now });

  res.json({
    message: student.assigned_advisor_id ? 'Advisor reassigned.' : 'Advisor assigned.',
    student: { id: student._id, guc_student_id: student.guc_student_id },
    advisor: publicAdvisor(advisor),
    previous_advisor_id: student.assigned_advisor_id || null,
  });
}

// Req 15 — a student sees only their own advisor; the id comes from the login, never from the URL.
async function getMyAdvisor(req, res) {
  const profile = await StudentProfile.findById(req.user._id).lean();
  if (!profile) throw new HttpError(404, 'Student profile not found.');
  if (profile.student_type !== 'ADVISING') throw new HttpError(403, 'Only Advising Students have an advisor.');
  const advisor = profile.assigned_advisor_id ? await User.findById(profile.assigned_advisor_id).lean() : null;
  if (!advisor) throw new HttpError(404, 'No advisor has been assigned to you yet.');
  res.json({ advisorName: advisor.full_name, advisorEmail: advisor.guc_email });
}

// Lets the Coordinator screen list advisors (and whether each is in the advising system).
async function listAdvisors(req, res) {
  const advisors = await User.find({ role: 'ADVISOR' }).select('guc_email full_name account_status advising_active').sort({ full_name: 1 }).lean();
  res.json(advisors.map((a) => ({ id: a._id, full_name: a.full_name, guc_email: a.guc_email,
    account_status: a.account_status, advising_active: a.advising_active !== false })));
}

module.exports = { addAdvisor, removeAdvisor, assignAdvisor, getMyAdvisor, listAdvisors };
