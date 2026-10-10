// Seeds Person 5's data for the evaluation:
//   - every MET (CS) and DMET course + 10 electives  (MET and DMET Curriculum sheet)
//   - two academic terms: Winter 2026/2027 (running) and Spring 2026/2027 (upcoming)
// Safe to run again: courses and terms are matched by code / (year, season) and reset to these values.
//   npm run seed:catalogue
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const Course = require('../models/Course');
const AcademicTerm = require('../models/AcademicTerm');
const { catalogueDocs } = require('../data/curriculum');
const { validateTerm } = require('../services/termRules');

const TERMS = [
  {
    academic_year: '2026/2027', season: 'WINTER',
    term_start: '2026-09-12', teaching_start: '2026-09-19', teaching_end: '2026-12-31', term_end: '2027-01-31',
    advising_deadline: '2026-10-31T23:59:00', swap_deadline: '2026-09-30T23:59:00',
  },
  {
    academic_year: '2026/2027', season: 'SPRING',
    term_start: '2027-02-06', teaching_start: '2027-02-13', teaching_end: '2027-05-27', term_end: '2027-06-30',
    advising_deadline: '2027-02-28T23:59:00', swap_deadline: '2027-02-20T23:59:00',
  },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/guc_schedule');

  const docs = catalogueDocs();
  const c = await Course.bulkWrite(docs.map((d) => ({
    updateOne: { filter: { course_code: d.course_code }, update: { $set: d, $setOnInsert: { _id: randomUUID() } }, upsert: true },
  })));
  const electives = docs.filter((d) => d.course_type === 'ELECTIVE').length;
  console.log(`Course catalogue: ${docs.length} courses (${docs.length - electives} CS/DMET + ${electives} electives), ${c.upsertedCount} new.`);

  for (const t of TERMS) {
    const { value } = validateTerm(t);
    await AcademicTerm.updateOne(
      { academic_year: value.academic_year, season: value.season },
      { $set: value, $setOnInsert: { _id: randomUUID() } },
      { upsert: true }
    );
    console.log(`Term: ${value.name} (advising deadline ${value.advising_deadline.toISOString().slice(0, 10)})`);
  }
  await mongoose.disconnect();
}

if (require.main === module) run().catch((e) => { console.error(e); process.exit(1); });
module.exports = { TERMS };
