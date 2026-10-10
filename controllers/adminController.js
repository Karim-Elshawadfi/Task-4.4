// Req 10: an Administrator activates or deactivates a user account.
// Deactivation only flips users.account_status (login and `protect` already refuse non-ACTIVE accounts) and revokes
// the user's open sessions. Academic, scheduling and audit records are never touched or deleted.
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const { HttpError } = require('../services/httpError');

const { ACCOUNT_STATUSES } = User;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toDto = (u) => ({
  user_id: u._id, full_name: u.full_name, guc_email: u.guc_email, role: u.role,
  account_status: u.account_status, updated_at: u.updated_at,
});

// GET /api/admin/users?search=   (all roles; search by name or GUC email)
async function listUsers(req, res) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const rx = search ? new RegExp(escapeRegExp(search), 'i') : null;
  const filter = rx ? { $or: [{ full_name: rx }, { guc_email: rx }] } : {};
  const users = await User.find(filter).select('full_name guc_email role account_status updated_at')
    .sort({ full_name: 1 }).limit(200).lean();
  res.json({ users: users.map(toDto), total: await User.countDocuments(filter) });
}

// PATCH /api/admin/users/:id/status   body: { "account_status": "ACTIVE" | "DEACTIVATED" }
async function updateUserStatus(req, res) {
  const { account_status } = req.body || {};
  if (!ACCOUNT_STATUSES.includes(account_status)) {
    throw new HttpError(400, "account_status must be 'ACTIVE' or 'DEACTIVATED'.");
  }
  if (req.params.id === req.user._id && account_status !== 'ACTIVE') {
    throw new HttpError(400, 'You cannot deactivate your own account.');
  }
  const user = await User.findOneAndUpdate({ _id: req.params.id }, { $set: { account_status } },
    { returnDocument: 'after' }).lean();
  if (!user) throw new HttpError(404, 'User not found.');
  // A deactivated user is signed out everywhere, and an old session cannot come back to life on reactivation.
  if (account_status === 'DEACTIVATED') await AuthSession.deleteMany({ user_id: user._id });
  res.json(toDto(user));
}

module.exports = { listUsers, updateUserStatus };
