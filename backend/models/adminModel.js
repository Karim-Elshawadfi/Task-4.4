const pool = require('../config/db');

const AdminModel = {
  /** Lists users (no password_hash). Optional search on name/email. */
  async listUsers(search) {
    const term = search ? `%${search}%` : null;
    const { rows } = await pool.query(
      `SELECT user_id, guc_email, full_name, role, account_status, updated_at
         FROM users
        WHERE ($1::text IS NULL OR full_name ILIKE $1 OR guc_email ILIKE $1)
        ORDER BY full_name ASC`,
      [term]
    );
    return rows;
  },

  /** Only flips the status flag; academic/scheduling/audit rows are untouched. */
  async updateAccountStatus(userId, status) {
    const { rows } = await pool.query(
      `UPDATE users
          SET account_status = $1, updated_at = NOW()
        WHERE user_id = $2
        RETURNING user_id, guc_email, full_name, role, account_status, updated_at`,
      [status, userId]
    );
    return rows[0] || null;
  },
};

module.exports = AdminModel;
