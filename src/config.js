'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const CONFIG_FILE = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config.json');
const EXAMPLE_FILE = path.join(__dirname, '..', 'config.example.json');

const DEFAULTS = {
  server: { port: 5000, host: '0.0.0.0', defaultDir: null },
  auth: { passwordHash: '' },
  email: { enabled: false, service: 'gmail', user: '', pass: '', recipient: '' },
  security: { allowedRoots: [], enforceAuth: true },
  session: { secret: '' },
  execute: { timeoutMs: 60000 },
  projects: [],
};

let config = null;

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function migrate(raw) {
  const cfg = deepMerge(DEFAULTS, raw);

  // Strip runtime keys polluted into project objects via the old PUT merge
  if (Array.isArray(cfg.projects)) {
    for (const p of cfg.projects) {
      delete p.status;
      delete p.stats;
      delete p.health;
      if (!Array.isArray(p.tags)) p.tags = [];
      if (typeof p.autoRestart !== 'boolean') p.autoRestart = false;
      if (typeof p.emailOnCrash !== 'boolean') p.emailOnCrash = false;
    }
  }

  // Env overrides (secrets never required to live in config.json)
  if (process.env.SESSION_SECRET) cfg.session.secret = process.env.SESSION_SECRET;
  if (process.env.SMTP_USER) cfg.email.user = process.env.SMTP_USER;
  if (process.env.SMTP_PASS) cfg.email.pass = process.env.SMTP_PASS;
  if (process.env.SMTP_RECIPIENT) cfg.email.recipient = process.env.SMTP_RECIPIENT;
  if (process.env.PORT) cfg.server.port = parseInt(process.env.PORT, 10);
  if (process.env.HOST) cfg.server.host = process.env.HOST;

  // Auto-generate + persist a session secret on first run
  if (!cfg.session.secret) {
    cfg.session.secret = crypto.randomBytes(32).toString('hex');
    cfg._secretGenerated = true;
  }

  return cfg;
}

async function loadConfiguration() {
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      try {
        raw = JSON.parse(await fs.readFile(EXAMPLE_FILE, 'utf8'));
      } catch {
        console.error('No config.json and no config.example.json found. Run "npm run setup".');
        process.exit(1);
      }
      console.warn('config.json not found; starting from config.example.json template.');
    } else {
      console.error('Failed to load configuration:', err.message);
      console.error('Please run "npm run setup" to configure the application');
      process.exit(1);
    }
  }

  config = migrate(raw);

  if (config._secretGenerated) {
    delete config._secretGenerated;
    try {
      await saveConfig(config);
      console.log('Generated a new session secret and stored it in config.json');
    } catch (e) {
      console.warn('Could not persist session secret:', e.message);
    }
  }

  if (!config.auth.passwordHash) {
    console.warn('WARNING: auth.passwordHash is empty — login will fail until you run "npm run setup".');
  }

  console.log('Configuration loaded successfully');
  return config;
}

function getConfig() {
  if (!config) throw new Error('Configuration not loaded');
  return config;
}

async function saveConfig(next) {
  config = next;
  // Atomic write: temp file + rename, so a crash mid-write cannot corrupt config.json
  const tmp = CONFIG_FILE + '.' + process.pid + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
  await fs.rename(tmp, CONFIG_FILE);
}

module.exports = { loadConfiguration, getConfig, saveConfig, CONFIG_FILE, DEFAULTS };
