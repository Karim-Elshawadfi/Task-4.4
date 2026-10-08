// Table `workflow_actions` — NOT in the Sprint 1 unified schema; owned by Req 6-9.
// One document per completed step in a student's scheduling workflow.
// student_profiles.workflow_status is CALCULATED from this history (Req 6 rule:
// "The status is calculated from completed workflow actions; Advisors do not
// manually overwrite it").
const mongoose = require('mongoose');
const { ACTION_TYPES } = require('../services/workflowStatus');

const workflowActionSchema = new mongoose.Schema(
  {
    student_id: { type: String, ref: 'StudentProfile', required: true }, // -> student_profiles.student_id
    action_type: { type: String, enum: ACTION_TYPES, required: true },
    performed_by: { type: String, ref: 'User' }, // -> users.user_id
    note: { type: String },
  },
  { collection: 'workflow_actions', timestamps: { createdAt: 'created_at', updatedAt: false } }
);

workflowActionSchema.index({ student_id: 1, created_at: -1 });

module.exports =
  mongoose.models.WorkflowAction || mongoose.model('WorkflowAction', workflowActionSchema);
