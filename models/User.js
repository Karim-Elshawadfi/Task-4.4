// Table `users` from the Sprint 1 unified schema (owned by Person 1/2).
// If your team already has this model, KEEP YOURS — the field names below are the
// agreed ones, so Req 6-9 will work against it unchanged.
// PK `user_id` (UUID) is stored as Mongo `_id`.
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const ROLES = ['STUDENT', 'ADVISOR', 'COORDINATOR', 'ADMIN'];
const ACCOUNT_STATUSES = ['ACTIVE', 'DEACTIVATED'];

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() }, // user_id
    guc_email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true, select: false },
    full_name: { type: String, required: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
    account_status: { type: String, enum: ACCOUNT_STATUSES, default: 'ACTIVE' },
  },
  { collection: 'users', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.ACCOUNT_STATUSES = ACCOUNT_STATUSES;
