// A student's result in one course. Req 61 reads FAILED / UNATTENDED rows from here.
// (The academic-history screens, Req 54-56, belong to Person 8; this model is shared with them.)
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const RECORD_STATUSES = ['COMPLETED', 'FAILED', 'UNATTENDED'];

const academicRecordSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    student_id: { type: String, ref: 'StudentProfile', required: true },
    course_code: { type: String, required: true },
    grade: { type: String },
    semester_taken: { type: String },
    academic_year: { type: String },
    status: { type: String, enum: RECORD_STATUSES, required: true },
    // Req 61: a failed/unattended course is mandatory unless an approved removal applies.
    removal_approved: { type: Boolean, default: false },
  },
  { collection: 'academic_records' }
);

academicRecordSchema.index({ student_id: 1, status: 1 });

module.exports = mongoose.models.AcademicRecord || mongoose.model('AcademicRecord', academicRecordSchema);
module.exports.RECORD_STATUSES = RECORD_STATUSES;
