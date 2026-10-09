const express = require('express');
const helmet = require('helmet');
const path = require('node:path');
const { createAuthRoutes } = require('./routes/authRoutes');
const { createResetMailer } = require('./services/resetMailer');

function createApp({ secret = process.env.JWT_SECRET, origin = process.env.APP_ORIGIN || 'http://localhost:5050',
  production = process.env.NODE_ENV === 'production', sendResetEmail = createResetMailer() } = {}) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  const allowedOrigin = new URL(origin).origin;
  if (production && !allowedOrigin.startsWith('https://')) throw new Error('Production APP_ORIGIN must use HTTPS.');
  const app = express();
  app.locals.auth = { secret, origin: allowedOrigin, production, sendResetEmail };
  app.use(helmet({ strictTransportSecurity: production ? undefined : false,
    contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': production ? [] : null } } }));
  app.use(express.json({ limit: '8kb' }));
  app.use('/api/auth', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const requestOrigin = req.headers.origin;
      if (req.headers['sec-fetch-site'] === 'cross-site' || (requestOrigin && requestOrigin !== allowedOrigin)) {
        return res.status(403).json({ message: 'Request origin is not allowed.' });
      }
      if (!req.is('application/json')) return res.status(415).json({ message: 'Send application/json.' });
    }
    next();
  }, createAuthRoutes());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Request is too large.' });
    console.error('Authentication service error:', error.name);
    res.status(503).json({ message: 'Service is temporarily unavailable. Please try again.' });
  });
  return app;
}

module.exports = { createApp };
