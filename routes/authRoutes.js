const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomInt, timingSafeEqual } = require('node:crypto');
const { rateLimit } = require('express-rate-limit');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const PasswordReset = require('../models/PasswordReset');
const { protect } = require('../middleware/auth');
const { normalizeEmail, hasRoleEmail, validNewPassword, hashCode, publicUser } = require('../services/authSecurity');

const HOUR = 60 * 60 * 1000;
const INVALID_LOGIN = 'Invalid email or password, or account is inactive.';
const RESET_MESSAGE = 'If an eligible account exists, a reset code will be sent to its GUC email.';
// Same bcrypt cost as stored passwords; unknown accounts still perform a hash comparison.
const dummyHash = bcrypt.hashSync('unusable-account-placeholder', 12);

function createAuthRoutes() {
  const router = express.Router();
  const limiter = (limit, windowMs = 15 * 60 * 1000) => rateLimit({
    windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again later.' },
  });
  const cookieOptions = req => ({ httpOnly: true, sameSite: 'strict',
    secure: req.app.locals.auth.production, path: '/' });

  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.post('/login', limiter(10), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) {
      return res.status(400).json({ message: 'Enter a valid GUC email and password.' });
    }
    const user = await User.findOne({ guc_email: email }).select('+password_hash').lean();
    const matches = await bcrypt.compare(password, user?.password_hash || dummyHash);
    if (!user || !matches || user.account_status !== 'ACTIVE' || !hasRoleEmail(user)) {
      return res.status(401).json({ message: INVALID_LOGIN });
    }
    const session = await AuthSession.create({ user_id: user._id,
      credential_hash: hashCode(user._id, user.password_hash, req.app.locals.auth.secret),
      expires_at: new Date(Date.now() + 8 * HOUR) });
    const token = jwt.sign({ id: user._id }, req.app.locals.auth.secret, {
      algorithm: 'HS256', jwtid: session._id, expiresIn: '8h', issuer: 'guc-scheduling', audience: 'guc-scheduling',
    });
    res.cookie('token', token, { ...cookieOptions(req), maxAge: 8 * HOUR });
    res.json({ token, user: publicUser(user) });
  });

  router.get('/me', protect, (req, res) => res.json({ user: publicUser(req.user) }));

  router.post('/logout', protect, async (req, res) => {
    await AuthSession.deleteOne({ _id: req.authSession._id });
    res.clearCookie('token', cookieOptions(req));
    res.json({ message: 'You have been logged out.' });
  });

  router.post('/forgot-password', limiter(5), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ message: 'Enter a valid GUC email.' });
    const user = await User.findOne({ guc_email: email, account_status: 'ACTIVE' }).lean();
    if (!user || !hasRoleEmail(user)) return res.status(202).json({ message: RESET_MESSAGE });
    const now = new Date();
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const codeHash = hashCode(user._id, code, req.app.locals.auth.secret);
    // Conditional upsert is an account-wide cooldown, including simultaneous requests from different IPs.
    let reset;
    try {
      reset = await PasswordReset.findOneAndUpdate({ _id: user._id,
        issued_at: { $lte: new Date(now.getTime() - 60 * 1000) } }, {
        $set: { code_hash: codeHash, attempts: 0, issued_at: now,
          expires_at: new Date(now.getTime() + 10 * 60 * 1000), consumed_at: null },
      }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
    } catch (error) {
      if (error.code === 11000) return res.status(202).json({ message: RESET_MESSAGE });
      throw error;
    }
    try { await req.app.locals.auth.sendResetEmail({ email: user.guc_email, code }); }
    catch {
      await PasswordReset.deleteOne({ _id: reset._id, code_hash: codeHash });
      // Keep the public response identical for existing and missing accounts. Never log codes or credentials.
      console.error('Password reset email delivery failed. Check SMTP configuration.');
    }
    res.status(202).json({ message: RESET_MESSAGE });
  });

  router.post('/reset-password', limiter(10), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const { code, newPassword } = req.body || {};
    if (!email || typeof code !== 'string' || !/^\d{6}$/.test(code) || !validNewPassword(newPassword)) {
      return res.status(400).json({ message: 'Enter a GUC email, six-digit code, and password of at least 12 characters (at most 72 UTF-8 bytes).' });
    }
    const invalid = () => res.status(400).json({ message: 'Invalid or expired reset code.' });
    const user = await User.findOne({ guc_email: email, account_status: 'ACTIVE' }).lean();
    if (!user || !hasRoleEmail(user)) return invalid();
    // Increment attempts atomically so parallel guesses cannot bypass the five-attempt limit.
    const reset = await PasswordReset.findOneAndUpdate({ _id: user._id, consumed_at: null,
      attempts: { $lt: 5 }, expires_at: { $gt: new Date() } }, { $inc: { attempts: 1 } },
    { returnDocument: 'after' }).select('+code_hash').lean();
    if (!reset) return invalid();
    const candidate = Buffer.from(hashCode(user._id, code, req.app.locals.auth.secret), 'hex');
    const stored = Buffer.from(reset.code_hash, 'hex');
    if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) return invalid();
    const passwordHash = await bcrypt.hash(newPassword, 12);
    // Only one competing request can consume this exact code; a newly issued code is never consumed here.
    const consumed = await PasswordReset.findOneAndUpdate({ _id: user._id, code_hash: reset.code_hash,
      consumed_at: null, expires_at: { $gt: new Date() } }, { $set: { consumed_at: new Date() } });
    if (!consumed) return invalid();
    const updated = await User.updateOne({ _id: user._id, account_status: 'ACTIVE' }, { $set: { password_hash: passwordHash } });
    if (!updated.matchedCount) return invalid();
    await AuthSession.deleteMany({ user_id: user._id });
    res.clearCookie('token', cookieOptions(req));
    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  });

  return router;
}

module.exports = { createAuthRoutes };
