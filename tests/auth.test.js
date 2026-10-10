const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../app');
const { protect, requireRole } = require('../middleware/auth');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const PasswordReset = require('../models/PasswordReset');

const secret = 'integration-test-secret-32-characters-minimum';
const password = 'ExistingPassword123!';
const email = 'normal@student.guc.edu.eg';
let mongo, app, sent, hash;
test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), AuthSession.init(), PasswordReset.init()]);
  hash = await bcrypt.hash(password, 12);
});
test.after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
test.beforeEach(async () => {
  await Promise.all([User.deleteMany({}), AuthSession.deleteMany({}), PasswordReset.deleteMany({})]);
  sent = [];
  app = createApp({ secret, sendResetEmail: async item => { sent.push(item); } });
  app.get('/test/admin', protect, requireRole('ADMIN'), (req, res) => res.json({ ok: true }));
  await User.insertMany([
    { full_name: 'Normal Student', guc_email: email, role: 'STUDENT' },
    { full_name: 'Advising Student', guc_email: 'advising@student.guc.edu.eg', role: 'STUDENT' },
    { full_name: 'Advisor', guc_email: 'advisor@guc.edu.eg', role: 'ADVISOR' },
    { full_name: 'Coordinator', guc_email: 'coordinator@guc.edu.eg', role: 'COORDINATOR' },
    { full_name: 'Admin', guc_email: 'admin@guc.edu.eg', role: 'ADMIN' },
    { full_name: 'Inactive', guc_email: 'inactive@student.guc.edu.eg', role: 'STUDENT', account_status: 'DEACTIVATED' },
    { full_name: 'Wrong Domain', guc_email: 'wrong@guc.edu.eg', role: 'STUDENT' },
  ].map(user => ({ ...user, password_hash: hash })));
});
const login = (address = email, extra = {}) => request(app).post('/api/auth/login').send({ email: address, password, ...extra });
const bearer = token => ({ Authorization: `Bearer ${token}` });
const sendCode = (address = email) => request(app).post('/api/auth/forgot-password').send({ email: address });
const reset = (code, newPassword = 'ReplacementPassword123!', address = email) => request(app).post('/api/auth/reset-password').send({ email: address, code, newPassword });

test('all five stakeholder types can log in; role comes from the database', async () => {
  for (const address of [email, 'advising@student.guc.edu.eg', 'advisor@guc.edu.eg', 'coordinator@guc.edu.eg', 'admin@guc.edu.eg']) {
    const result = await login(address, { role: 'ADMIN' }).expect(200);
    const payload = jwt.verify(result.body.token, secret);
    assert.equal(payload.id, result.body.user.id);
    assert.ok(payload.jti);
    assert.equal(payload.exp - payload.iat, 8 * 60 * 60);
    assert.equal(result.body.user.role, address.endsWith('@student.guc.edu.eg') ? 'STUDENT' : address.split('@')[0].toUpperCase());
    assert.ok(!JSON.stringify(result.body).includes('password_hash'));
    assert.match(result.headers['set-cookie'][0], /HttpOnly/);
    assert.match(result.headers['set-cookie'][0], /SameSite=Strict/);
  }
});

test('normalizes email and rejects wrong passwords, inactive accounts, and mismatched role domains', async () => {
  await login(' NORMAL@STUDENT.GUC.EDU.EG ').expect(200);
  const wrong = await login(email, { password: 'WrongPassword!' }).expect(401);
  const missing = await login('missing@student.guc.edu.eg').expect(401);
  const inactive = await login('inactive@student.guc.edu.eg').expect(401);
  assert.equal(wrong.body.message, missing.body.message);
  assert.equal(wrong.body.message, inactive.body.message);
  await login('wrong@guc.edu.eg').expect(401);
  await login('user@gmail.com').expect(400);
  await login(email, { email: { $ne: null } }).expect(400);
  await request(app).post('/api/auth/signup').send({}).expect(404);
});

test('cookie and bearer sessions work and logout revokes a copied token', async () => {
  const agent = request.agent(app);
  const result = await agent.post('/api/auth/login').send({ email, password }).expect(200);
  await agent.get('/api/auth/me').expect(200);
  await request(app).get('/api/auth/me').set(bearer(result.body.token)).expect(200);
  await agent.post('/api/auth/logout').send({}).expect(200);
  await agent.get('/api/auth/me').expect(401);
  await request(app).get('/api/auth/me').set(bearer(result.body.token)).expect(401);
});

test('unauthenticated, forged, session-less, and expired tokens cannot access protected routes', async () => {
  await request(app).get('/api/auth/me').expect(401);
  const result = await login().expect(200);
  await request(app).get('/api/auth/me').set(bearer(result.body.token + 'x')).expect(401);
  const legacy = jwt.sign({ id: result.body.user.id }, secret);
  await request(app).get('/api/auth/me').set(bearer(legacy)).expect(401);
  await AuthSession.updateMany({}, { $set: { expires_at: new Date(Date.now() - 1) } });
  await request(app).get('/api/auth/me').set(bearer(result.body.token)).expect(401);
});

test('access middleware checks live role and live activation status', async () => {
  const student = await login().expect(200);
  await request(app).get('/test/admin').set(bearer(student.body.token)).expect(403);
  const admin = await login('admin@guc.edu.eg').expect(200);
  await request(app).get('/test/admin').set(bearer(admin.body.token)).expect(200);
  await User.updateOne({ _id: admin.body.user.id }, { $set: { role: 'ADVISOR' } });
  await request(app).get('/test/admin').set(bearer(admin.body.token)).expect(403);
  await User.updateOne({ _id: student.body.user.id }, { $set: { account_status: 'DEACTIVATED' } });
  await request(app).get('/api/auth/me').set(bearer(student.body.token)).expect(401);
});

test('reset request sends only to the registered email and reveals neither account existence nor OTP', async () => {
  const existing = await sendCode().expect(202);
  const missing = await sendCode('missing@student.guc.edu.eg').expect(202);
  const inactive = await sendCode('inactive@student.guc.edu.eg').expect(202);
  assert.deepEqual(existing.body, missing.body);
  assert.deepEqual(existing.body, inactive.body);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].email, email);
  assert.match(sent[0].code, /^\d{6}$/);
  assert.ok(!JSON.stringify(existing.body).includes(sent[0].code));
  const stored = await PasswordReset.findOne({}).select('+code_hash').lean();
  assert.notEqual(stored.code_hash, sent[0].code);
  await sendCode().expect(202);
  assert.equal(sent.length, 1, 'account cooldown prevents resend');
});

test('successful reset changes password, revokes sessions, and prevents OTP reuse', async () => {
  const oldSession = await login().expect(200);
  await sendCode().expect(202);
  const code = sent[0].code;
  await reset(code).expect(200);
  await login().expect(401);
  await login(email, { password: 'ReplacementPassword123!' }).expect(200);
  await request(app).get('/api/auth/me').set(bearer(oldSession.body.token)).expect(401);
  await reset(code).expect(400);
  assert.equal(await AuthSession.countDocuments({ user_id: oldSession.body.user.id }), 1);
});

test('five bad OTP attempts lock the code, including against a later correct guess', async () => {
  await sendCode().expect(202);
  const wrong = sent[0].code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await reset(wrong).expect(400);
  await reset(sent[0].code).expect(400);
});

test('expired OTPs, codes for another account, and deactivated accounts cannot reset', async () => {
  await sendCode().expect(202);
  await reset(sent[0].code, undefined, 'advising@student.guc.edu.eg').expect(400);
  await PasswordReset.updateMany({}, { $set: { expires_at: new Date(Date.now() - 1) } });
  await reset(sent[0].code).expect(400);
  await User.updateOne({ guc_email: email }, { $set: { account_status: 'DEACTIVATED' } });
  await reset(sent[0].code).expect(400);
});

test('a reissued OTP replaces the previous one', async () => {
  await sendCode().expect(202);
  await PasswordReset.updateMany({}, { $set: { issued_at: new Date(Date.now() - 61000) } });
  await sendCode().expect(202);
  assert.equal(sent.length, 2);
  if (sent[0].code !== sent[1].code) await reset(sent[0].code).expect(400);
  await reset(sent[1].code).expect(200);
});

test('simultaneous correct reset requests consume the code only once', async () => {
  await sendCode().expect(202);
  const results = await Promise.all([reset(sent[0].code), reset(sent[0].code)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
});

test('rejects weak/oversized passwords and malformed reset codes', async () => {
  await reset('123456', 'short').expect(400);
  await reset('123456', 'a'.repeat(73)).expect(400);
  await reset('123456', 'é'.repeat(37)).expect(400);
  await reset('12x456').expect(400);
});

test('cross-origin writes and non-JSON writes are blocked; rate limits are enforced', async () => {
  await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ email, password }).expect(403);
  await request(app).post('/api/auth/login').type('form').send({ email, password }).expect(415);
  await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json').expect(400);
  for (let i = 0; i < 10; i++) await login('bad@gmail.com').expect(400);
  await login().expect(429);
});

test('production requires a strong secret and HTTPS; its session cookie is Secure', async () => {
  assert.throws(() => createApp({ secret: 'weak' }), /JWT_SECRET/);
  assert.throws(() => createApp({ secret, production: true }), /HTTPS/);
  const productionApp = createApp({ secret, production: true, origin: 'https://schedule.example' });
  const response = await request(productionApp).post('/api/auth/login').send({ email, password }).expect(200);
  assert.match(response.headers['set-cookie'][0], /Secure/);
});
