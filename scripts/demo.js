// Disposable local P6 demo. No existing .env/database/email configuration is used.
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

let mongo;
let server;
let child;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  child?.kill();
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  process.exit(code);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

async function seed(script, env) {
  await new Promise((resolve, reject) => {
    child = spawn(process.execPath, [script], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => { child = null; code === 0 ? resolve() : reject(new Error(`Seed failed: ${script}`)); });
  });
}

(async () => {
  const port = Number(process.env.P6_DEMO_PORT || 5056);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('P6_DEMO_PORT must be between 1024 and 65535.');
  console.log('Starting a disposable MongoDB replica set. The first run may download MongoDB unless MONGOMS_SYSTEM_BINARY points to your cached executable.');
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongo.getUri('p6_demo');
  const secret = randomBytes(32).toString('hex');
  const origin = `http://localhost:${port}`;
  const env = { ...process.env, MONGO_URI: uri, JWT_SECRET: secret, APP_ORIGIN: origin,
    PORT: String(port), NODE_ENV: 'development' };
  for (const script of ['seed/seedCatalogue.js', 'seed/seedStudents.js', 'seed/seedOfferings.js']) await seed(script, env);
  await mongoose.connect(uri);
  const { createApp } = require('../app');
  await require('../services/schedulingTransaction').initializeScheduling();
  for (const name of ['User', 'AuthSession', 'PasswordReset']) await require(`../models/${name}`).init();
  const app = createApp({ secret, origin, production: false,
    sendResetEmail: async () => { throw new Error('Email is disabled in this disposable P6 demo.'); },
    sendAdvisorEmail: async () => { throw new Error('Email is disabled in this disposable P6 demo.'); } });
  server = app.listen(port, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  console.log(`\nP6 demo ready: ${origin}`);
  console.log('admin@guc.edu.eg manages offerings; coordinator@guc.edu.eg manages standard schedules.');
  console.log('Password for both: Password123!');
  console.log('Click the offerings link after login. Keep this terminal open. Ctrl+C stops the demo and discards its data.');
})().catch(async error => { console.error(error.message); await stop(1); });
