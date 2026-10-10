// Table `course_catalogue` (course catalogue, Req 18-21 — owned by the catalogue person).
// If the catalogue person already has a Course model on this collection, KEEP THEIRS and
// only check that services/courseCatalog.js#normalizeCourse reads the right field names.
// PK `course_id` (UUID) is stored as Mongo `_id`.
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const COURSE_TYPES = ['CORE', 'ELECTIVE', 'HUMA'];
const OFFERING_SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'BOTH'];

const courseSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() }, // course_id
    course_code: { type: String, required: true, unique: true, trim: true }, // e.g. "CSEN 301"
    course_name: { type: String, required: true, trim: true },
    credit_hours: { type: Number, required: true, min: 0 },
    course_type: { type: String, enum: COURSE_TYPES, required: true },
    majors: [{ type: String }], // faculty/major, e.g. ['CS', 'DMET']
    // Where the course sits in each major's study plan (DMET 502 is sem 5 for DMET, sem 7 for CS).
    curriculum: [{ _id: false, major: String, semester: Number }],
    recommended_semester: { type: Number },
    offering_season: { type: String, enum: OFFERING_SEASONS, default: 'BOTH' },
    prerequisites: [{ type: String }], // course codes
  },
  { collection: 'course_catalogue', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

module.exports = mongoose.models.Course || mongoose.model('Course', courseSchema);
module.exports.COURSE_TYPES = COURSE_TYPES;
module.exports.OFFERING_SEASONS = OFFERING_SEASONS;
