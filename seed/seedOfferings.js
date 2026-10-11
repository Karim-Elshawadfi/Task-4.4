// Seeds Req 22-30 for the evaluation: published course offerings with their lecture,
// tutorial and lab slots, two standard schedule groups per major and semester, and the
// seeded normal students assigned to a group.
//
// Run the other two seeds first, they provide what this one builds on:
//   npm run seed:catalogue   (Person 5: the terms and the course catalogue)
//   npm run seed             (Person 3: the students, advisors, coordinator, administrator)
//   npm run seed:offerings   (this file)
//
// Safe to run again: it removes the offerings, standard schedules and group assignments of
// the term it seeds, then rebuilds them. It touches no user, student or catalogue record.
try { require('dotenv').config(); } catch {}
const mongoose = require('mongoose');
const AcademicTerm = require('../models/AcademicTerm');
const Course = require('../models/Course');
const CourseOffering = require('../models/CourseOffering');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const GroupAssignment = require('../models/GroupAssignment');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
const { GUC_SLOTS, DAYS } = require('../services/offeringRules');
const { recordWorkflowAction } = require('../services/workflowStatus');

// The cohorts the evaluation database needs: the majors and semesters the seeded
// normal students are in.
const COHORTS = [
  ['CS', 1], ['DMET', 1],
  ['CS', 3], ['DMET', 3],
  ['CS', 5], ['DMET', 5],
];
const STUDY_GROUPS = ['1', '2'];

const LECTURE_HALLS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8'];
const TUTORIAL_ROOMS = ['C6.01', 'C6.02', 'C6.03', 'C6.04', 'C6.05', 'C6.06', 'C7.01', 'C7.02'];
const LAB_ROOMS = ['C3.L1', 'C3.L2', 'C3.L3', 'C3.L4', 'C5.L1', 'C5.L2'];
const ROOMS = { LECTURE: LECTURE_HALLS, TUTORIAL: TUTORIAL_ROOMS, LAB: LAB_ROOMS };

const FIRST_NAMES = ['Amr Hassan', 'Salma Fathy', 'Karim Nabil', 'Mona Adel', 'Youssef Samir',
  'Hoda Sabry', 'Tamer Fouad', 'Nevine Rashad', 'Sherif Zaki', 'Dalia Mansour', 'Hany Guirguis',
  'Injy Hafez', 'Ramy Soliman', 'Yara Kamel', 'Ayman Nassar', 'Heba Shawky', 'Walid Serag',
  'Nadia Fahmy', 'Tarek Bahgat', 'Rasha Lotfy', 'Mahmoud Eid', 'Soha Gaber', 'Fady Riad', 'Laila Zaher'];

// Every teaching cell of the week: Saturday slot 1 ... Thursday slot 5.
const CELLS = DAYS.flatMap((day) => GUC_SLOTS.map((s) => ({ day, ...s })));
const cellKey = (c) => `${c.day}#${c.slot}`;

/**
 * Places every course in the week so that no room is used twice at the same time and no
 * cohort ever has two of its courses at the same time. That second rule is what makes the
 * standard schedules clash-free, which is exactly what Req 28 checks when they are saved.
 */
function schedule(courses) {
  const cohortBusy = new Map(); // "CS#3" -> Set of cell keys
  const roomBusy = new Map(); //   cell key -> Set of rooms
  const busyFor = (key) => cohortBusy.get(key) ?? cohortBusy.set(key, new Set()).get(key);
  const roomsAt = (cell) => roomBusy.get(cellKey(cell)) ?? roomBusy.set(cellKey(cell), new Set()).get(cellKey(cell));

  return courses.map((course, index) => {
    const cohortKeys = course.cohorts.map(([major, semester]) => `${major}#${semester}`);
    const groups = [];

    // A lecture for everyone, two tutorial groups, and a lab group per study group when the
    // course carries enough hours for one.
    const components = [
      { type: 'LECTURE', numbers: ['1'], capacity: 120 },
      { type: 'TUTORIAL', numbers: STUDY_GROUPS, capacity: 30 },
      ...(course.credit_hours >= 6 ? [{ type: 'LAB', numbers: STUDY_GROUPS.map((g) => `P${g}`), capacity: 25 }] : []),
    ];

    // Start each course at a different point in the week so the timetable spreads out
    // instead of stacking every course on Saturday morning.
    const order = CELLS.map((_, i) => CELLS[(i + index * 7) % CELLS.length]);

    for (const component of components) {
      // The first cell that is free for every cohort taking this course, with enough rooms.
      const cell = order.find((candidate) => {
        if (cohortKeys.some((key) => busyFor(key).has(cellKey(candidate)))) return false;
        const taken = roomsAt(candidate);
        return ROOMS[component.type].filter((r) => !taken.has(r)).length >= component.numbers.length;
      });
      if (!cell) throw new Error(`No free time left for ${course.course_code} ${component.type}`);

      const taken = roomsAt(cell);
      const free = ROOMS[component.type].filter((r) => !taken.has(r));
      component.numbers.forEach((group_number, i) => {
        const room = free[i];
        taken.add(room);
        groups.push({
          type: component.type, group_number, day: cell.day,
          start_time: cell.start_time, end_time: cell.end_time,
          room, max_capacity: component.capacity, assigned_count: 0,
        });
      });
      cohortKeys.forEach((key) => busyFor(key).add(cellKey(cell)));
    }

    return {
      ...course,
      instructors: [`Dr. ${FIRST_NAMES[index % FIRST_NAMES.length]}${index >= FIRST_NAMES.length ? ` ${Math.floor(index / FIRST_NAMES.length) + 1}` : ''}`],
      groups,
    };
  });
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/guc_schedule');

  const term = await AcademicTerm.findOne({ academic_year: '2026/2027', season: 'WINTER' }).lean();
  if (!term) throw new Error('No Winter 2026/2027 term. Run "npm run seed:catalogue" first.');

  const catalogue = await Course.find({}).lean();
  if (!catalogue.length) throw new Error('The course catalogue is empty. Run "npm run seed:catalogue" first.');

  // Start from a clean term so the seed can be run again.
  const old = await CourseOffering.find({ term_id: term._id }).select('_id').lean();
  const oldTemplates = await ScheduleTemplate.find({ term_id: term._id }).select('_id').lean();
  await GroupAssignment.deleteMany({ term_id: term._id });
  await ScheduleTemplate.deleteMany({ _id: { $in: oldTemplates.map((t) => t._id) } });
  await CourseOffering.deleteMany({ _id: { $in: old.map((o) => o._id) } });

  // One offering per course, carrying every cohort that studies it.
  const wanted = new Map();
  for (const [major, semester] of COHORTS) {
    for (const course of catalogue) {
      if (!(course.curriculum || []).some((c) => c.major === major && Number(c.semester) === semester)) continue;
      const entry = wanted.get(course.course_code) ?? { ...course, cohorts: [] };
      entry.cohorts.push([major, semester]);
      wanted.set(course.course_code, entry);
    }
  }
  const planned = schedule([...wanted.values()].sort((a, b) => a.course_code.localeCompare(b.course_code)));

  const offerings = [];
  for (const course of planned) {
    offerings.push(await CourseOffering.create({
      term_id: term._id, academic_year: term.academic_year, season: term.season,
      course_id: course._id, course_code: course.course_code, course_name: course.course_name,
      instructors: course.instructors,
      eligible_groups: course.cohorts.map(([major, semester]) => ({ major, semester })),
      is_published: true, // Req 27: schedules may only use published offerings
      groups: course.groups,
    }));
  }

  // Three electives are left as unpublished drafts that no standard schedule uses, so the
  // publish and delete rules of Req 26 and 27 can actually be tried out: every other offering
  // ends up in a published standard schedule with students in it, and is therefore locked.
  const spare = catalogue
    .filter((c) => c.course_type === 'ELECTIVE' && !wanted.has(c.course_code))
    .slice(0, 3);
  const drafts = [];
  for (const [i, course] of spare.entries()) {
    drafts.push(await CourseOffering.create({
      term_id: term._id, academic_year: term.academic_year, season: term.season,
      course_id: course._id, course_code: course.course_code, course_name: course.course_name,
      instructors: [`Dr. ${FIRST_NAMES[(planned.length + i) % FIRST_NAMES.length]}`],
      eligible_groups: [{ major: 'CS', semester: 9 }, { major: 'DMET', semester: 9 }],
      is_published: false,
      groups: [{
        type: 'LECTURE', group_number: '1', day: DAYS[i % DAYS.length],
        start_time: '15:15', end_time: '16:45', room: `H${9 + i}`, max_capacity: 60, assigned_count: 0,
      }],
    }));
  }

  // A standard schedule per cohort and study group: the shared lecture, that group's
  // tutorial, and that group's lab when the course has one (Req 28).
  const templates = [];
  for (const [major, semester] of COHORTS) {
    const forCohort = offerings.filter((o) => o.eligible_groups.some((g) => g.major === major && Number(g.semester) === semester));
    for (const study_group of STUDY_GROUPS) {
      const entries = forCohort.map((offering) => ({
        offering_id: offering._id,
        course_code: offering.course_code,
        course_name: offering.course_name,
        slot_ids: offering.groups
          .filter((g) => (g.type === 'LECTURE' ? g.group_number === '1'
            : g.type === 'TUTORIAL' ? g.group_number === study_group
              : g.group_number === `P${study_group}`))
          .map((g) => g._id),
      })).filter((e) => e.slot_ids.length);

      templates.push(await ScheduleTemplate.create({
        term_id: term._id, major, semester, study_group, is_published: true, entries,
      }));
    }
  }

  // Req 30: put every seeded normal student in the first group of their cohort.
  const profiles = await StudentProfile.find({ student_type: 'NORMAL' }).lean();
  let assigned = 0;
  const unplaced = [];
  for (const profile of profiles) {
    const template = templates.find((t) => t.major === profile.major && Number(t.semester) === Number(profile.current_semester) && t.study_group === '1');
    const user = await User.findById(profile._id).lean();
    if (!template) { unplaced.push(`${user?.full_name ?? profile._id} (${profile.major} semester ${profile.current_semester})`); continue; }

    await GroupAssignment.findOneAndUpdate(
      { student_id: profile._id, term_id: term._id },
      { $set: { template_id: template._id, major: template.major, semester: template.semester, study_group: template.study_group } },
      { upsert: true }
    );
    // Seat the student in every slot of the group, the same way the API does.
    for (const entry of template.entries) {
      const offering = offerings.find((o) => o._id === entry.offering_id);
      const ids = new Set(entry.slot_ids);
      offering.groups.forEach((g) => { if (ids.has(g._id)) g.assigned_count += 1; });
    }
    await recordWorkflowAction(profile._id, 'SCHEDULE_ASSIGNED', null,
      `Assigned to ${template.major} semester ${template.semester} group ${template.study_group}`).catch(() => {});
    assigned += 1;
  }
  for (const offering of offerings) {
    await CourseOffering.updateOne({ _id: offering._id }, { $set: { groups: offering.groups } });
  }

  const slots = offerings.reduce((n, o) => n + o.groups.length, 0);
  console.log(
    `Seeded ${offerings.length} published course offerings (${slots} lecture/tutorial/lab slots) ` +
    `plus ${drafts.length} unpublished drafts (${drafts.map((d) => d.course_code).join(', ')}) ` +
    `and ${templates.length} published standard schedules in ${term.name}.\n` +
    `Assigned ${assigned} normal student(s) to group 1 of their cohort.` +
    (unplaced.length ? `\nNo standard schedule for: ${unplaced.join(', ')}` : '')
  );
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e.message); process.exit(1); });
