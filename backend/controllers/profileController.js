const ProfileModel = require('../models/profileModel');

// GET /api/users/profile  – a user can only ever view their own profile.
const getProfile = async (req, res) => {
  try {
    const user = await ProfileModel.findUserById(req.user.user_id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const profile = { ...user };

    if (user.role === 'STUDENT') {
      const academic = await ProfileModel.findStudentProfileByUserId(user.user_id);
      profile.student_profile = academic
        ? {
            guc_student_id: academic.guc_student_id,
            student_type: academic.student_type,
            major: academic.major,
            current_semester: academic.current_semester,
            academic_standing: academic.academic_standing,
            schedule_status: academic.workflow_status,
            assigned_advisor: academic.advisor_id
              ? {
                  user_id: academic.advisor_id,
                  full_name: academic.advisor_name,
                  guc_email: academic.advisor_email,
                }
              : null, // only advising students have one
          }
        : null;
    }

    res.json(profile);
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = { getProfile };
