const mongoose = require('mongoose');
const { createApp } = require('./app');
const { assertTransactionSupport, initializeScheduling } = require('./services/schedulingTransaction');

async function start() {
  const app = createApp();
  const port = Number(process.env.PORT || 5050);
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/guc_schedule');
  await assertTransactionSupport();
  await initializeScheduling();
  // init() waits for the unique indexes, including "one offering per course per term" and
  // "one standard schedule group per student per term" (Req 22, 28, 30).
  await Promise.all([
    './models/User', './models/AuthSession', './models/PasswordReset',
    './models/CourseOffering', './models/ScheduleTemplate', './models/GroupAssignment',
  ].map(p => require(p).init()));
  app.listen(port, () => console.log(`Authentication running at ${app.locals.auth.origin}`));
}

start().catch(error => { console.error('Unable to start authentication:', error.message); process.exitCode = 1; });
