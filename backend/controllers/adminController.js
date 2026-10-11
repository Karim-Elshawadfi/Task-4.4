const AdminModel = require('../models/adminModel');

const ALLOWED_STATUSES = ['ACTIVE', 'DEACTIVATED'];

// GET /api/admin/users?search=
const listUsers = async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    res.json(await AdminModel.listUsers(search || null));
  } catch (err) {
    console.error('listUsers error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

// PATCH /api/admin/users/:id/status   body: { account_status: 'ACTIVE' | 'DEACTIVATED' }
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { account_status } = req.body || {};

    if (!ALLOWED_STATUSES.includes(account_status)) {
      return res.status(400).json({ message: "account_status must be 'ACTIVE' or 'DEACTIVATED'." });
    }

    const updated = await AdminModel.updateAccountStatus(id, account_status);
    if (!updated) return res.status(404).json({ message: 'User not found.' });

    res.json(updated);
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ message: 'Invalid user id.' });
    console.error('updateUserStatus error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = { listUsers, updateUserStatus };
