// Req 57: an advising student's scheduling preferences. A student can hold several of each type
// (e.g. two avoided days), ranked by `priority` (1 = most important).
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const PREFERENCE_TYPES = [
  'PREFERRED_DAY', 'AVOIDED_DAY', 'PREFERRED_TIME_RANGE', 'AVOIDED_TIME_RANGE',
  'PREFERRED_GROUP', 'DAY_OFF', 'NOTE',
];

const schedulingPreferenceSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    student_id: { type: String, ref: 'StudentProfile', required: true },
    preference_type: { type: String, enum: PREFERENCE_TYPES, required: true },
    value: { type: String, required: true, trim: true },
    priority: { type: Number, default: 1, min: 1 },
  },
  { collection: 'scheduling_preferences', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

schedulingPreferenceSchema.index({ student_id: 1, priority: 1 });

module.exports = mongoose.models.SchedulingPreference || mongoose.model('SchedulingPreference', schedulingPreferenceSchema);
module.exports.PREFERENCE_TYPES = PREFERENCE_TYPES;
