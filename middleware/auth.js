const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const { cookieToken, hashCode } = require('../services/authSecurity');

async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : cookieToken(req);
  if (!token) return res.status(401).json({ message: 'Please log in.' });
  let payload;
  try {
    payload = jwt.verify(token, req.app.locals.auth.secret, {
      algorithms: ['HS256'], issuer: 'guc-scheduling', audience: 'guc-scheduling',
    });
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
  try {
    const session = await AuthSession.findOne({ _id: payload.jti, user_id: payload.id,
      expires_at: { $gt: new Date() } }).select('+credential_hash').lean();
    if (!session) return res.status(401).json({ message: 'Please log in again.' });
    const user = await User.findById(payload.id).select('+password_hash').lean();
    if (!user || user.account_status !== 'ACTIVE') {
      return res.status(401).json({ message: 'Account is not active.' });
    }
    if (session.credential_hash !== hashCode(user._id, user.password_hash, req.app.locals.auth.secret)) {
      return res.status(401).json({ message: 'Please log in again.' });
    }
    delete user.password_hash;
    req.user = user;
    req.authSession = session;
    next();
  } catch (error) { next(error); }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Please log in.' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have access to this page.' });
  next();
};

module.exports = { protect, requireRole };
