const mongoose = require('mongoose');
const { createApp } = require('./app');

async function start() {
  const app = createApp();
  const port = Number(process.env.PORT || 5050);
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/guc_schedule');
  await Promise.all(['./models/User', './models/AuthSession', './models/PasswordReset'].map(p => require(p).init()));
  app.listen(port, () => console.log(`Authentication running at ${app.locals.auth.origin}`));
}

start().catch(error => { console.error('Unable to start authentication:', error.message); process.exitCode = 1; });
