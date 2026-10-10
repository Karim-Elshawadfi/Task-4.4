// Advisor history (Req 14): one row per period during which an advisor was assigned to a student.
// A reassignment closes the old row (removed_at) and opens a new one, so history is never lost.
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const advisorAssignmentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    student_id: { type: String, ref: 'StudentProfile', required: true },
    advisor_id: { type: String, ref: 'User', required: true },
    assigned_by: { type: String, ref: 'User', default: null }, // the Coordinator who made the change
    assigned_at: { type: Date, default: Date.now },
    removed_at: { type: Date, default: null }, // null = current assignment
  },
  { collection: 'advisor_assignments' }
);

advisorAssignmentSchema.index({ student_id: 1, removed_at: 1 });
advisorAssignmentSchema.index({ advisor_id: 1, removed_at: 1 });

module.exports = mongoose.models.AdvisorAssignment || mongoose.model('AdvisorAssignment', advisorAssignmentSchema);
