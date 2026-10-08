// Seeds the data the "Evaluation DB" sheet asks for (students, advisors,
// coordinator, administrator) plus workflow history so every status shows up.
// Run:  MONGO_URI="mongodb://..." node seed/seedStudents.js
// WARNING: deletes existing users (and their student_profiles / workflow_actions)
// with the @guc.edu.eg / @student.guc.edu.eg emails it creates.
try { require('dotenv').config(); } catch {}
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const WorkflowAction = require('../models/WorkflowAction');
const { recalculateWorkflow } = require('../services/workflowStatus');

const PASSWORD = 'Password123!';

const advisors = [
  ['Dr. Amr Hassan', 'amr.hassan@guc.edu.eg'],
  ['Dr. Salma Fathy', 'salma.fathy@guc.edu.eg'],
  ['Dr. Karim Nabil', 'karim.nabil@guc.edu.eg'],
  ['Dr. Mona Adel', 'mona.adel@guc.edu.eg'],
  ['Dr. Youssef Samir', 'youssef.samir@guc.edu.eg'],
];

// [name, id, major, semester, standing, active, advisorIndex, actions...]
const advisingStudents = [
  ['Omar Khaled', '52-1001', 'CS', 5, 'Good Academic Standing', true, 0, []],
  ['Nour Ahmed', '52-1002', 'DMET', 5, 'Good Academic Standing', true, 0, ['DRAFT_CREATED']],
  ['Hana Mostafa', '53-1003', 'CS', 3, 'Probation', true, 1, ['DRAFT_CREATED', 'SENT_FOR_STUDENT_REVIEW']],
  ['Ali Tarek', '53-1004', 'CS', 3, 'Good Academic Standing', true, 1, ['DRAFT_CREATED', 'SENT_FOR_STUDENT_REVIEW', 'CHANGE_REQUESTED']],
  ['Malak Sherif', '54-1005', 'DMET', 7, 'Good Academic Standing', true, 2, ['DRAFT_CREATED', 'SENT_FOR_STUDENT_REVIEW', 'STUDENT_ACCEPTED']],
  ['Ziad Hossam', '54-1006', 'CS', 7, 'Probation', true, 2, ['DRAFT_CREATED', 'SENT_FOR_STUDENT_REVIEW', 'STUDENT_ACCEPTED', 'SCHEDULE_APPROVED']],
  ['Farida Wael', '55-1007', 'DMET', 1, 'Good Academic Standing', true, 3, ['DRAFT_CREATED', 'SENT_FOR_STUDENT_REVIEW', 'STUDENT_ACCEPTED', 'SCHEDULE_APPROVED', 'PAYMENT_DEFERRED']],
  ['Youssef Ehab', '55-1008', 'CS', 1, 'Good Academic Standing', true, 3, ['DRAFT_CREATED', 'SENT_FOR_STUDENT_REVIEW', 'STUDENT_ACCEPTED', 'SCHEDULE_APPROVED', 'PAYMENT_CHOSEN']],
  ['Jana Hesham', '51-1009', 'CS', 9, 'Good Academic Standing', true, 4, ['DRAFT_CREATED', 'SENT_FOR_STUDENT_REVIEW', 'STUDENT_ACCEPTED', 'SCHEDULE_APPROVED', 'PAYMENT_CHOSEN', 'SCHEDULE_PROCESSED']],
  ['Seif Magdy', '51-1010', 'DMET', 9, 'Probation', false, 4, ['DRAFT_CREATED', 'SENT_FOR_STUDENT_REVIEW', 'STUDENT_ACCEPTED', 'SCHEDULE_APPROVED', 'PAYMENT_CHOSEN', 'SCHEDULE_PROCESSED', 'SCHEDULE_REOPENED']],
];

const normalStudents = [
  ['Laila Mahmoud', '56-2001', 'CS', 3, ['SCHEDULE_ASSIGNED']],
  ['Adham Fouad', '56-2002', 'DMET', 3, ['SCHEDULE_ASSIGNED', 'SWAP_REQUESTED']],
  ['Rana Yasser', '57-2003', 'CS', 1, ['SCHEDULE_ASSIGNED', 'SWAP_REQUESTED', 'SWAP_COMPLETED']],
  ['Mazen Ashraf', '57-2004', 'CS', 1, ['SCHEDULE_ASSIGNED', 'SWAP_REQUESTED', 'SWAP_WITHDRAWN']],
  ['Salma Ibrahim', '55-2005', 'DMET', 5, ['SCHEDULE_ASSIGNED', 'SWAP_REQUESTED', 'SWAP_EXPIRED']],
];

const toEmail = (name) =>
  name.toLowerCase().replace(/^dr\.\s*/, '').replace(/\s+/g, '.');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/guc_schedule');
  const hash = await bcrypt.hash(PASSWORD, 10);

  const emails = [
    ...advisors.map((a) => a[1]),
    'coordinator@guc.edu.eg',
    'admin@guc.edu.eg',
    ...advisingStudents.map((s) => `${toEmail(s[0])}@student.guc.edu.eg`),
    ...normalStudents.map((s) => `${toEmail(s[0])}@student.guc.edu.eg`),
  ];
  const oldIds = (await User.find({ guc_email: { $in: emails } }).select('_id').lean()).map((o) => o._id);
  await WorkflowAction.deleteMany({ student_id: { $in: oldIds } });
  await StudentProfile.deleteMany({ _id: { $in: oldIds } });
  await User.deleteMany({ _id: { $in: oldIds } });

  const advisorDocs = await User.insertMany(
    advisors.map(([full_name, guc_email]) => ({ full_name, guc_email, password_hash: hash, role: 'ADVISOR' }))
  );
  const coordinator = await User.create({ full_name: 'Dr. Rania Lotfy', guc_email: 'coordinator@guc.edu.eg', password_hash: hash, role: 'COORDINATOR' });
  await User.create({ full_name: 'Ahmed Saeed', guc_email: 'admin@guc.edu.eg', password_hash: hash, role: 'ADMIN' });

  const day = 24 * 60 * 60 * 1000;
  let clock = Date.now() - 30 * day;

  async function createStudent({ full_name, active, ...profile }) {
    const user = await User.create({
      full_name, guc_email: `${toEmail(full_name)}@student.guc.edu.eg`, password_hash: hash,
      role: 'STUDENT', account_status: active === false ? 'DEACTIVATED' : 'ACTIVE',
    });
    await StudentProfile.create({ _id: user._id, ...profile });
    return user;
  }

  async function addActions(studentId, types, actorId) {
    for (const action_type of types) {
      clock += Math.floor(day / 3);
      await WorkflowAction.collection.insertOne({
        student_id: studentId, action_type, performed_by: actorId, created_at: new Date(clock),
      });
    }
    await recalculateWorkflow(studentId);
  }

  for (const [full_name, guc_student_id, major, sem, standing, active, advIdx, actions] of advisingStudents) {
    const s = await createStudent({
      full_name, active, guc_student_id, student_type: 'ADVISING', major, current_semester: sem,
      academic_standing: standing, assigned_advisor_id: advisorDocs[advIdx]._id,
    });
    await addActions(s._id, actions, advisorDocs[advIdx]._id);
  }
  for (const [full_name, guc_student_id, major, sem, actions] of normalStudents) {
    const s = await createStudent({
      full_name, guc_student_id, student_type: 'NORMAL', major, current_semester: sem,
      academic_standing: 'Good Academic Standing',
    });
    await addActions(s._id, actions, coordinator._id);
  }

  console.log(`Seeded ${advisingStudents.length} advising + ${normalStudents.length} normal students, ` +
    `${advisors.length} advisors, 1 coordinator, 1 administrator. Password for all: ${PASSWORD}`);
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
