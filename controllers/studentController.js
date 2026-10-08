// Req 6: list all students + workflow status
// Req 7: search by student ID, full name or GUC email
//
// Reads `student_profiles` joined with `users` (Sprint 1 unified schema) and
// `workflow_actions` (Req 6-9) for the last-update time.
const StudentProfile = require('../models/StudentProfile');
const { BLOCKING_STEP, defaultStatus } = require('../services/workflowStatus');

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

// GET /api/students?search=&sort=&page=&limit=
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

module.exports = {
  listStudents,
  buildStudentQuery,
  buildSort,
  escapeRegex,
};
