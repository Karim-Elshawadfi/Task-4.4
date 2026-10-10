// One command that seeds everything the Evaluation DB sheet needs:
//   1. students, advisors, coordinator, administrator + workflow history   (seed/seedStudents.js, Person 3)
//   2. every CS/DMET course, 10 electives and the academic terms           (seed/seedCatalogue.js, Person 5)
//   3. a few in-app notifications for every seeded user                    (Req 5, Person 2)
// Safe to run again. NOTE: seedStudents.js re-creates its users (new ids) on every run, so notifications of
// the old users are removed and re-created here.   npm run seed:all
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const Notification = require('../models/Notification');

// Each seed script connects, seeds and disconnects on its own, so run them one after another.
const runSeed = (file) => execFileSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit', env: process.env });

async function seedNotifications() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/guc_schedule');
  const users = await User.find({}).select('full_name role').lean();
  const profiles = new Map((await StudentProfile.find({}).lean()).map((p) => [p._id, p]));
  const names = new Map(users.map((u) => [u._id, u.full_name]));

  const wanted = []; // [user_id, message, is_read]
  for (const user of users) {
    wanted.push([user._id, 'Welcome to the GUC scheduling system.', false]);
    const profile = profiles.get(user._id);
    if (!profile) continue;
    if (profile.assigned_advisor_id) {
      wanted.push([user._id, `${names.get(profile.assigned_advisor_id)} is now your advisor.`, true]);
    }
    if (profile.workflow_status) wanted.push([user._id, `Your schedule status is now "${profile.workflow_status}".`, false]);
  }

  // Idempotent: one row per (user, message). Raw driver call so the demo rows get distinct, ordered timestamps.
  let created = 0;
  for (const [i, [user_id, message, is_read]] of wanted.entries()) {
    const r = await Notification.collection.updateOne({ user_id, message }, {
      $setOnInsert: { _id: require('node:crypto').randomUUID(), is_read, created_at: new Date(Date.now() - (wanted.length - i) * 60_000) },
    }, { upsert: true });
    created += r.upsertedCount;
  }
  const orphans = await Notification.deleteMany({ user_id: { $nin: users.map((u) => u._id) } });
  console.log(`Notifications: ${created} new, ${orphans.deletedCount} removed for users that no longer exist.`);
  await mongoose.disconnect();
}

async function run() {
  runSeed('seedStudents.js');
  runSeed('seedCatalogue.js');
  await seedNotifications();
}

run().catch((e) => { console.error(e); process.exit(1); });
