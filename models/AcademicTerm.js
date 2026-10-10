// Table `academic_terms` (Req 16-17). One document per academic term.
// Other features read these dates to block actions after their deadline:
//   advising_deadline -> advising-student actions (e.g. Req 57 scheduling preferences)
//   swap_deadline     -> normal-student whole-schedule swap (Req 34-35)
// Use services/termRules.js#termStatus() / getCurrentTerm() instead of re-implementing the checks.
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const TERM_SEASONS = ['WINTER', 'SPRING', 'SUMMER'];

const academicTermSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() }, // term_id
    academic_year: { type: String, required: true, match: /^\d{4}\/\d{4}$/ }, // "2026/2027"
    season: { type: String, enum: TERM_SEASONS, required: true },
    name: { type: String, required: true }, // "Winter 2026/2027"
    term_start: { type: Date, required: true },
    term_end: { type: Date, required: true },
    teaching_start: { type: Date, required: true },
    teaching_end: { type: Date, required: true },
    advising_deadline: { type: Date, required: true },
    swap_deadline: { type: Date, required: true }, // normal-student whole-schedule-swap deadline
  },
  { collection: 'academic_terms', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

academicTermSchema.index({ academic_year: 1, season: 1 }, { unique: true });

module.exports = mongoose.models.AcademicTerm || mongoose.model('AcademicTerm', academicTermSchema);
module.exports.TERM_SEASONS = TERM_SEASONS;
