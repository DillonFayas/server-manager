'use strict';

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { getConfig } = require('./config');
const { audit } = require('./audit');
const { validate, schemas } = require('./validation');

function sessionSecret() {
  const s = getConfig().session && getConfig().session.secret;
  if (!s) throw new Error('session.secret is not configured');
  return s;
}

function createSessionMiddleware() {
  return session({
    name: 'sm.sid',
    secret: sessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // app is typically HTTP behind a LAN/proxy; set true when TLS terminated at app
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

function securityEnforced() {
  const cfg = getConfig();
  return !cfg.security || cfg.security.enforceAuth !== false;
}

function requireAuth(req, res, next) {
  if (!securityEnforced()) return next();
  if (req.session && req.session.isAuthenticated) return next();
  res.status(401).json({ success: false, error: 'Authentication required' });
}

function createAuthRouter(sessionMiddleware) {
  const router = express.Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many login attempts. Try again later.' },
  });

  router.post('/login', loginLimiter, validate(schemas.login), async (req, res) => {
    const { password } = req.body;
    const hash = getConfig().auth && getConfig().auth.passwordHash;

    if (!hash) {
      audit(req, 'login', '-', { reason: 'not-configured' }, false);
      return res.status(503).json({ success: false, error: 'No password configured. Run "npm run setup".' });
    }

    let match = false;
    try {
      match = await bcrypt.compare(password, hash);
    } catch {
      match = false;
    }

    if (match) {
      req.session.isAuthenticated = true;
      audit(req, 'login', '-', {}, true);
      return res.json({ success: true });
    }
    audit(req, 'login', '-', { reason: 'bad-password' }, false);
    return res.status(401).json({ success: false });
  });

  router.post('/logout', (req, res) => {
    audit(req, 'logout', '-');
    req.session.destroy(() => {
      res.clearCookie('sm.sid');
      res.json({ success: true });
    });
  });

  router.get('/session', (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.isAuthenticated), enforced: securityEnforced() });
  });

  return router;
}

module.exports = { createSessionMiddleware, createAuthRouter, requireAuth, securityEnforced };
