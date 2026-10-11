// Mints a session + token the same way POST /api/auth/login does, so `protect` accepts it.
const jwt = require('jsonwebtoken');
const AuthSession = require('../../models/AuthSession');
const { hashCode } = require('../../services/authSecurity');

function createSessions(secret) {
  const tokens = new Map();
  const signIn = async (user) => {
    const session = await AuthSession.create({ user_id: user._id,
      credential_hash: hashCode(user._id, user.password_hash, secret), expires_at: new Date(Date.now() + 3600e3) });
    tokens.set(user._id, jwt.sign({ id: user._id }, secret,
      { algorithm: 'HS256', jwtid: session._id, expiresIn: '1h', issuer: 'guc-scheduling', audience: 'guc-scheduling' }));
  };
  const auth = (user) => ({ Authorization: `Bearer ${tokens.get(user._id)}` });
  return { signIn, auth };
}

module.exports = { createSessions };
