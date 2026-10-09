const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');

const schema = new mongoose.Schema({
  _id: { type: String, default: randomUUID },
  user_id: { type: String, required: true, index: true, ref: 'User' },
  credential_hash: { type: String, required: true, select: false },
  expires_at: { type: Date, required: true, index: { expires: 0 } },
}, { collection: 'auth_sessions', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.models.AuthSession || mongoose.model('AuthSession', schema);
