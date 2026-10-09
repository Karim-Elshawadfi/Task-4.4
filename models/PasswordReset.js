const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String, required: true }, // Same UUID as users._id: one outstanding code per account.
  code_hash: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0 },
  issued_at: { type: Date, required: true },
  expires_at: { type: Date, required: true, index: { expires: 0 } },
  consumed_at: { type: Date, default: null },
}, { collection: 'password_resets' });

module.exports = mongoose.models.PasswordReset || mongoose.model('PasswordReset', schema);
