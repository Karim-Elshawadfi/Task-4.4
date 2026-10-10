// Table `student_profiles` from the Sprint 1 unified schema (owned by Person 1/2).
// If your team already has this model, KEEP YOURS — the field names below are the agreed ones.
// PK `student_id` (= users.user_id) is stored as Mongo `_id`.
const mongoose = require('mongoose');

const STUDENT_TYPES = ['NORMAL', 'ADVISING'];

const studentProfileSchema = new mongoose.Schema(
  {
    _id: { type: String, ref: 'User' }, // student_id -> users.user_id
    guc_student_id: { type: String, required: true, unique: true, trim: true }, // e.g. "64-12345"
    student_type: { type: String, enum: STUDENT_TYPES, required: true },
    major: { type: String },
    current_semester: { type: Number },
    academic_standing: { type: String },
    assigned_advisor_id: { type: String, ref: 'User', default: null },
    // Derived — NEVER set directly. Recalculated by services/workflowStatus.js
    // from the workflow_actions history.
    workflow_status: { type: String },
  },
  { collection: 'student_profiles' }
);

studentProfileSchema.index({ assigned_advisor_id: 1 });
studentProfileSchema.index({ workflow_status: 1 });

module.exports =
  mongoose.models.StudentProfile || mongoose.model('StudentProfile', studentProfileSchema);
module.exports.STUDENT_TYPES = STUDENT_TYPES;
