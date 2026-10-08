// Req 6: list all students + workflow status
// Req 7: search by student ID, full name or GUC email
// Req 8: filter by type, advisor, major, semester, standing, status, blocking step, account status
//
// Reads `student_profiles` joined with `users` (Sprint 1 unified schema) and
// `workflow_actions` (Req 6-9) for the last-update time.
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const { STUDENT_TYPES } = StudentProfile;
const { ACCOUNT_STATUSES } = User;
const {
  NORMAL_STATUSES,
  ADVISING_STATUSES,
  BLOCKING_STEPS,
  BLOCKING_STEP,
  statusesBlockedOn,
  defaultStatus,
} = require('../services/workflowStatus');

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORTABLE = {
  name: 'user.full_name',
  studentId: 'guc_student_id',
  semester: 'current_semester',
  updated: 'last_updated',
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- Aggregation stages used by the list endpoint ----
const WITH_USER = [
  {
    $lookup: {
      from: 'users',
      localField: '_id',
      foreignField: '_id',
      pipeline: [{ $project: { password_hash: 0 } }],
      as: 'user',
    },
  },
  { $unwind: '$user' },
  // Profiles created before any workflow action have no workflow_status yet.
  {
    $set: {
      workflow_status: {
        $ifNull: [
          '$workflow_status',
          { $cond: [{ $eq: ['$student_type', 'NORMAL'] }, defaultStatus('NORMAL'), defaultStatus('ADVISING')] },
        ],
      },
    },
  },
];

const WITH_LAST_UPDATED = [
  {
    $lookup: {
      from: 'workflow_actions',
      localField: '_id',
      foreignField: 'student_id',
      pipeline: [{ $sort: { created_at: -1 } }, { $limit: 1 }, { $project: { _id: 0, created_at: 1 } }],
      as: 'last_action',
    },
  },
  { $set: { last_updated: { $ifNull: [{ $first: '$last_action.created_at' }, '$user.created_at'] } } },
];

const WITH_ADVISOR = [
  {
    $lookup: {
      from: 'users',
      localField: 'assigned_advisor_id',
      foreignField: '_id',
      pipeline: [{ $project: { full_name: 1, guc_email: 1 } }],
      as: 'advisor',
    },
  },
  { $set: { advisor: { $first: '$advisor' } } },
];

/** Builds the $match stage (applied after WITH_USER) from query params. Pure function -> unit tested. */
function buildStudentQuery(q = {}) {
  const and = [{ 'user.role': 'STUDENT' }];

  // ---- Req 7: search ----
  const search = String(q.search || '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    and.push({
      $or: [
        { guc_student_id: new RegExp('^' + escapeRegex(search), 'i') },
        { 'user.full_name': rx },
        { 'user.guc_email': rx },
      ],
    });
  }

  // ---- Req 8: filters ----
  const studentType = String(q.studentType || '').toUpperCase();
  if (STUDENT_TYPES.includes(studentType)) and.push({ student_type: studentType });
  if (q.advisor) {
    if (q.advisor === 'none') and.push({ assigned_advisor_id: null });
    else if (UUID_RX.test(q.advisor)) and.push({ assigned_advisor_id: q.advisor });
  }
  if (q.major) and.push({ major: q.major });
  if (q.semester && !Number.isNaN(Number(q.semester))) {
    and.push({ current_semester: Number(q.semester) });
  }
  if (q.standing) and.push({ academic_standing: q.standing });
  if (q.status) and.push({ workflow_status: q.status });
  if (q.blockingStep) and.push({ workflow_status: { $in: statusesBlockedOn(q.blockingStep) } });
  const accountStatus = String(q.accountStatus || '').toUpperCase();
  if (ACCOUNT_STATUSES.includes(accountStatus)) and.push({ 'user.account_status': accountStatus });

  return and.length === 1 ? and[0] : { $and: and };
}

function buildSort(sortParam = '-updated') {
  const desc = sortParam.startsWith('-');
  const key = SORTABLE[sortParam.replace(/^-/, '')] || SORTABLE.updated;
  return { [key]: desc ? -1 : 1, _id: 1 };
}

function toListItem(p) {
  return {
    id: p._id,
    fullName: p.user.full_name,
    email: p.user.guc_email,
    studentId: p.guc_student_id,
    studentType: p.student_type,
    major: p.major,
    currentSemester: p.current_semester,
    academicStanding: p.academic_standing,
    accountStatus: p.user.account_status,
    assignedAdvisor: p.advisor
      ? { id: p.advisor._id, fullName: p.advisor.full_name, email: p.advisor.guc_email }
      : null,
    workflowStatus: p.workflow_status,
    blockingStep: BLOCKING_STEP[p.workflow_status] ?? null,
    lastUpdated: p.last_updated,
  };
}

// GET /api/students?search=&studentType=&advisor=&major=&semester=&standing=&status=&blockingStep=&accountStatus=&sort=&page=&limit=
async function listStudents(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const [result] = await StudentProfile.aggregate([
      ...WITH_USER,
      { $match: buildStudentQuery(req.query) },
      ...WITH_LAST_UPDATED,
      { $sort: buildSort(req.query.sort) },
      {
        $facet: {
          students: [{ $skip: (page - 1) * limit }, { $limit: limit }, ...WITH_ADVISOR],
          total: [{ $count: 'n' }],
        },
      },
    ]);
    const total = result.total[0]?.n ?? 0;

    res.json({
      students: result.students.map(toListItem),
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/students/filter-options  -> values for the filter dropdowns (Req 8)
async function getFilterOptions(req, res, next) {
  try {
    const [advisors, majors, semesters, standings] = await Promise.all([
      User.find({ role: 'ADVISOR' }).select('full_name guc_email').sort('full_name').lean(),
      StudentProfile.distinct('major'),
      StudentProfile.distinct('current_semester'),
      StudentProfile.distinct('academic_standing'),
    ]);
    const present = (values) => values.filter((v) => v != null && v !== '');
    res.json({
      studentTypes: [
        { value: 'NORMAL', label: 'Normal Student' },
        { value: 'ADVISING', label: 'Advising Student' },
      ],
      advisors: advisors.map((a) => ({ value: a._id, label: a.full_name, email: a.guc_email })),
      majors: present(majors).sort(),
      semesters: present(semesters).sort((a, b) => a - b),
      standings: present(standings).sort(),
      statuses: { NORMAL: NORMAL_STATUSES, ADVISING: ADVISING_STATUSES },
      blockingSteps: BLOCKING_STEPS,
      accountStatuses: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'DEACTIVATED', label: 'Deactivated' },
      ],
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listStudents,
  getFilterOptions,
  buildStudentQuery,
  buildSort,
  escapeRegex,
};
