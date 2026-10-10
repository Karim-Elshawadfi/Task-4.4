const { createHmac } = require('node:crypto');

function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(student\.)?guc\.edu\.eg$/.test(email) ? email : null;
}

function hasRoleEmail(user) {
  return user.role === 'STUDENT'
    ? user.guc_email.endsWith('@student.guc.edu.eg')
    : ['ADVISOR', 'COORDINATOR', 'ADMIN'].includes(user.role) && user.guc_email.endsWith('@guc.edu.eg');
}

function validNewPassword(value) {
  // bcrypt truncates at 72 bytes. Reject longer values rather than silently truncating.
  return typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value, 'utf8') <= 72;
}

function hashCode(userId, code, secret) {
  return createHmac('sha256', secret).update(`${userId}:${code}`).digest('hex');
}

function publicUser(user) {
  return { id: user._id, user_id: user._id, guc_email: user.guc_email,
    full_name: user.full_name, role: user.role, account_status: user.account_status };
}

function cookieToken(req) {
  const item = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('token='));
  return item ? item.slice(6) : null;
}

module.exports = { normalizeEmail, hasRoleEmail, validNewPassword, hashCode, publicUser, cookieToken };
