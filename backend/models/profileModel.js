const pool = require('../config/db');

const ProfileModel = {
  /** Base user details. Never selects password_hash. */
  async findUserById(userId) {
    const { rows } = await pool.query(
      `SELECT user_id, guc_email, full_name, role, account_status, created_at
         FROM users
        WHERE user_id = $1`,
      [userId]
    );
    return rows[0] || null;
  },

  /** Academic details for a student, with the assigned advisor's name/email. */
  async findStudentProfileByUserId(userId) {
    const { rows } = await pool.query(
      `SELECT sp.guc_student_id,
              sp.student_type,
              sp.major,
              sp.current_semester,
              sp.academic_standing,
              sp.workflow_status,
              adv.user_id   AS advisor_id,
              adv.full_name AS advisor_name,
              adv.guc_email AS advisor_email
         FROM student_profiles sp
         LEFT JOIN users adv ON adv.user_id = sp.assigned_advisor_id
        WHERE sp.student_id = $1`,
      [userId]
    );
    return rows[0] || null;
  },
};

module.exports = ProfileModel;
