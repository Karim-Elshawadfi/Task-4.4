// Table `schedule_templates` (Req 28-29). The standard weekly schedule that every normal
// student of one major + semester + study group follows in one academic term.
//
// A template does not copy times: each entry points at slots that live in a course offering
// (Req 22), so changing an offering's slot changes every template that uses it. Req 30 builds
// a normal student's processed schedule from the assigned group's PUBLISHED template.
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

// One course in the template, with the offering slots this study group attends.
// `slot_ids` holds every slot: a course with two lectures and one tutorial has three.
const entrySchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    offering_id: { type: String, ref: 'CourseOffering', required: true },
    course_code: { type: String, required: true, trim: true },
    course_name: { type: String, trim: true },
    slot_ids: [{ type: String }], // -> course_offerings.groups._id
  },
  { _id: false }
);

const scheduleTemplateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() }, // template_id
    term_id: { type: String, ref: 'AcademicTerm', required: true },
    major: { type: String, required: true, trim: true }, //    'CS' | 'DMET'
    semester: { type: Number, required: true, min: 1, max: 10 },
    study_group: { type: String, required: true, trim: true }, // the standard schedule group, e.g. "1"
    // Only a published template may be assigned to students (Req 30).
    is_published: { type: Boolean, default: false },
    entries: [entrySchema],
  },
  { collection: 'schedule_templates', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// One standard schedule per major + semester + study group in a term (Req 28).
scheduleTemplateSchema.index({ term_id: 1, major: 1, semester: 1, study_group: 1 }, { unique: true });

module.exports =
  mongoose.models.ScheduleTemplate || mongoose.model('ScheduleTemplate', scheduleTemplateSchema);
