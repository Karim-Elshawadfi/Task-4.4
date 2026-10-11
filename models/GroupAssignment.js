// Table `student_group_assignments` (Req 30). Which standard schedule group a normal student
// belongs to in one academic term. Reassigning overwrites the row for that student and term,
// so a student is never in two groups at once.
//
// Seats are counted here: assigning a student raises `assigned_count` on every slot of the
// template, which is what Req 25 (cannot shrink capacity below it) and Req 26 (cannot delete
// a slot that has students) check.
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const groupAssignmentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    student_id: { type: String, ref: 'StudentProfile', required: true }, // = users.user_id
    term_id: { type: String, ref: 'AcademicTerm', required: true },
    template_id: { type: String, ref: 'ScheduleTemplate', required: true },
    major: { type: String, required: true },
    semester: { type: Number, required: true },
    study_group: { type: String, required: true },
    assigned_by: { type: String, ref: 'User' }, // the coordinator who assigned the group
  },
  { collection: 'student_group_assignments', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// One group per student per term — the index that makes "reassign" replace instead of duplicate.
groupAssignmentSchema.index({ student_id: 1, term_id: 1 }, { unique: true });
groupAssignmentSchema.index({ template_id: 1 });

module.exports =
  mongoose.models.GroupAssignment || mongoose.model('GroupAssignment', groupAssignmentSchema);
