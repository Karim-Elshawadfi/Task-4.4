// If you already have auth middleware from Req 1 (login), use yours instead and
// delete `protect` below. `requireRole` is the important part for Req 6-9.
const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
    if (!token) return res.status(401).json({ message: 'Not logged in' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).lean();
    if (!user || user.account_status !== 'ACTIVE') return res.status(401).json({ message: 'Account not active' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired session' });
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You are not allowed to access this page' });
  }
  next();
};

module.exports = { protect, requireRole };
