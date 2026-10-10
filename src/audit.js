'use strict';

const fs = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, '..', 'audit.log');

/**
 * Append one structured audit event. Never throws into the request path.
 * Records: time, ip, action, target, detail, ok.
 */
function audit(req, action, target, detail = {}, ok = true) {
  const entry = {
    time: new Date().toISOString(),
    ip: (req && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || (req && req.socket && req.socket.remoteAddress) || '-',
    action,
    target: target || '-',
    detail,
    ok,
  };
  try {
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n', { mode: 0o600 });
  } catch {
    /* auditing must never break the request */
  }
}

module.exports = { audit, AUDIT_FILE };
