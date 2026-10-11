// Table `course_offerings` (Req 22-27). One document per catalogue course delivered in one
// academic term, with its lecture, tutorial and lab groups embedded as `groups`.
//
// The collection name and the `course_code` / `course_id` fields are the ones Person 5's
// catalogue already looks for before deleting a course (Req 21), so do not rename them.
//
// A group's REMAINING CAPACITY is never stored: it is max_capacity - assigned_count,
// calculated on read by services/offeringRules.js#withRemaining.
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const GROUP_TYPES = ['LECTURE', 'TUTORIAL', 'LAB'];
const DAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'];

// One lecture, tutorial or lab group of the offering (Req 22: "its lecture, tutorial and lab slots").
const groupSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() }, // slot_id
    type: { type: String, enum: GROUP_TYPES, required: true },
    group_number: { type: String, required: true, trim: true }, // "1", "T2", "P3"
    day: { type: String, enum: DAYS, required: true },
    start_time: { type: String, required: true }, // "HH:MM", 24-hour
    end_time: { type: String, required: true },
    room: { type: String, required: true, trim: true },
    max_capacity: { type: Number, required: true, min: 1 },
    // Maintained by the features that seat students (Req 30 assigns normal students to a
    // standard schedule group). Req 25 refuses to shrink capacity below it and Req 26
    // refuses to delete a slot while it is above zero.
    assigned_count: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const courseOfferingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() }, // offering_id
    term_id: { type: String, ref: 'AcademicTerm', required: true },
    academic_year: { type: String, required: true }, // copied from the term: "2026/2027"
    season: { type: String, required: true }, //        copied from the term: WINTER/SPRING/SUMMER
    course_id: { type: String, ref: 'Course', required: true },
    course_code: { type: String, required: true, trim: true }, // "CSEN 301"
    course_name: { type: String, required: true, trim: true },
    instructors: [{ type: String, trim: true }], // assigned instructor(s), by name
    // Eligible major/semester groups, e.g. [{ major: 'CS', semester: 3 }]
    eligible_groups: [{ _id: false, major: String, semester: Number }],
    is_published: { type: Boolean, default: false }, // publication status (Req 27)
    groups: [groupSchema],
  },
  { collection: 'course_offerings', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// One offering per course per term (Req 22).
courseOfferingSchema.index({ term_id: 1, course_code: 1 }, { unique: true });
courseOfferingSchema.index({ term_id: 1, is_published: 1 });

module.exports = mongoose.models.CourseOffering || mongoose.model('CourseOffering', courseOfferingSchema);
module.exports.GROUP_TYPES = GROUP_TYPES;
module.exports.DAYS = DAYS;
