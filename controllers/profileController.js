// Req 4: a signed-in user views their own profile. Only the account in the session is ever read.
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const WorkflowAction = require('../models/WorkflowAction');
const { computeWorkflow } = require('../services/workflowStatus');

// GET /api/users/profile
async function getProfile(req, res) {
  // `protect` already loaded the signed-in user from `users`; read it again for fresh, minimal fields.
  const user = await User.findById(req.user._id).select('full_name guc_email role created_at').lean();
  const profile = { user_id: user._id, full_name: user.full_name, guc_email: user.guc_email, role: user.role };

  if (user.role === 'STUDENT') {
    const student = await StudentProfile.findById(user._id).lean();
    if (!student) {
      profile.student_profile = null;
    } else {
      // Schedule status is calculated from completed workflow actions (never read from a hand-set value).
      const actions = await WorkflowAction.find({ student_id: user._id }).select('action_type created_at').lean();
      const workflow = computeWorkflow(student.student_type, actions, user.created_at);
      const advisor = student.assigned_advisor_id
        ? await User.findById(student.assigned_advisor_id).select('full_name guc_email').lean()
        : null;
      profile.student_profile = {
        guc_student_id: student.guc_student_id,
        student_type: student.student_type,
        major: student.major ?? null,
        current_semester: student.current_semester ?? null,
        academic_standing: student.academic_standing ?? null,
        assigned_advisor: advisor ? { full_name: advisor.full_name, guc_email: advisor.guc_email } : null,
        schedule_status: workflow.status,
      };
    }
  }

  res.json(profile);
}

module.exports = { getProfile };
