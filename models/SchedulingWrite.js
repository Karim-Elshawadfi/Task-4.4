const mongoose = require('mongoose');

// All P6 mutations write this document first inside their transaction. Concurrent
// requests (including requests handled by another server process) then conflict and
// retry with a fresh snapshot, instead of validating against each other's stale data.
const schema = new mongoose.Schema({
  _id: String,
  revision: { type: Number, default: 0 },
}, { collection: 'scheduling_writes', versionKey: false });

module.exports = mongoose.models.SchedulingWrite || mongoose.model('SchedulingWrite', schema);
