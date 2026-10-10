// Turns a student's completed workflow actions into a status + blocking step.
// This is the single source of truth for the "workflow status" column (Req 6).

// action type -> resulting status, per student type
const NORMAL_TRANSITIONS = {
  SCHEDULE_ASSIGNED: 'Schedule Assigned',
  SWAP_REQUESTED: 'Swap Request Open',
  SWAP_COMPLETED: 'Swap Completed',
  SWAP_WITHDRAWN: 'Swap Withdrawn',
  SWAP_EXPIRED: 'Swap Expired',
};

const ADVISING_TRANSITIONS = {
  DRAFT_CREATED: 'Draft',
  SENT_FOR_STUDENT_REVIEW: 'Ready for Student Review',
  CHANGE_REQUESTED: 'Change Request Pending',
  STUDENT_ACCEPTED: 'Pending Approval',
  SCHEDULE_APPROVED: 'Awaiting Payment Choice',
  PAYMENT_DEFERRED: 'Deferred to Next Installment',
  PAYMENT_CHOSEN: 'Ready to Process',
  SCHEDULE_PROCESSED: 'Processed',
  SCHEDULE_REOPENED: 'Reopened',
};

const NORMAL_STATUSES = Object.values(NORMAL_TRANSITIONS);
const ADVISING_STATUSES = ['Not Started', ...Object.values(ADVISING_TRANSITIONS)];
const ACTION_TYPES = [...Object.keys(NORMAL_TRANSITIONS), ...Object.keys(ADVISING_TRANSITIONS)];

// What the workflow is waiting on (who must act next). "None" = nothing pending.
const BLOCKING_STEP = {
  'Schedule Assigned': 'None',
  'Swap Request Open': 'Swap partner response',
  'Swap Completed': 'None',
  'Swap Withdrawn': 'None',
  'Swap Expired': 'None',
  'Not Started': 'Advisor drafting schedule',
  Draft: 'Advisor sending draft to student',
  'Ready for Student Review': 'Student review',
  'Change Request Pending': 'Advisor handling change request',
  'Pending Approval': 'Coordinator approval',
  'Awaiting Payment Choice': 'Student payment choice',
  'Deferred to Next Installment': 'Next installment payment',
  'Ready to Process': 'Administrator processing',
  Processed: 'None',
  Reopened: 'Advisor revising schedule',
};
const BLOCKING_STEPS = [...new Set(Object.values(BLOCKING_STEP))];

// Statuses whose blocking step is `step` (used to filter by blocking step without storing it).
const statusesBlockedOn = (step) =>
  Object.keys(BLOCKING_STEP).filter((status) => BLOCKING_STEP[status] === step);

// Status shown before any action is recorded. A normal student with no recorded action
// has not been assigned a schedule yet; we still show the earliest state of the normal flow.
const defaultStatus = (studentType) => (studentType === 'NORMAL' ? 'Schedule Assigned' : 'Not Started');

/**
 * @param {'NORMAL'|'ADVISING'} studentType  student_profiles.student_type
 * @param {Array<{action_type: string, created_at: Date}>} actions  any order
 * @param {Date} [fallbackDate] used when there are no actions (e.g. account creation date)
 */
function computeWorkflow(studentType, actions = [], fallbackDate = null) {
  const transitions = studentType === 'NORMAL' ? NORMAL_TRANSITIONS : ADVISING_TRANSITIONS;
  const relevant = actions
    .filter((a) => transitions[a.action_type])
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const last = relevant[relevant.length - 1];
  const status = last ? transitions[last.action_type] : defaultStatus(studentType);
  return {
    status,
    blockingStep: BLOCKING_STEP[status],
    updatedAt: last ? new Date(last.created_at) : fallbackDate,
  };
}

/**
 * Record a completed action and recalculate the student's workflow_status.
 * Every feature that moves the workflow (drafting, approving, swaps...) must call this
 * instead of writing student_profiles.workflow_status directly.
 * @param {string} studentId  student_profiles.student_id (= users.user_id)
 * @param {string} performedBy  users.user_id
 */
async function recordWorkflowAction(studentId, actionType, performedBy, note) {
  const WorkflowAction = require('../models/WorkflowAction');
  await WorkflowAction.create({ student_id: studentId, action_type: actionType, performed_by: performedBy, note });
  return recalculateWorkflow(studentId);
}

async function recalculateWorkflow(studentId) {
  const StudentProfile = require('../models/StudentProfile');
  const WorkflowAction = require('../models/WorkflowAction');
  const profile = await StudentProfile.findById(studentId);
  if (!profile) throw new Error('Student not found');
  const actions = await WorkflowAction.find({ student_id: studentId }).select('action_type created_at').lean();
  const workflow = computeWorkflow(profile.student_type, actions);
  profile.workflow_status = workflow.status;
  await profile.save();
  return workflow;
}

module.exports = {
  NORMAL_STATUSES,
  ADVISING_STATUSES,
  ACTION_TYPES,
  BLOCKING_STEPS,
  BLOCKING_STEP,
  statusesBlockedOn,
  defaultStatus,
  computeWorkflow,
  recordWorkflowAction,
  recalculateWorkflow,
};
