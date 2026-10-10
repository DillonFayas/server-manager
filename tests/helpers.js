import { vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcrypt';

process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod';
process.env.CONFIG_PATH = path.join(os.tmpdir(), `sm-test-config-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

const TEST_CONFIG = {
  server: { port: 0, host: '127.0.0.1' },
  auth: { passwordHash: '' },
  email: { enabled: false, service: 'gmail', user: '', pass: '', recipient: '' },
  security: { allowedRoots: [], enforceAuth: true },
  session: { secret: 'test-secret-do-not-use-in-prod' },
  execute: { timeoutMs: 5000 },
  projects: [],
};

function writeTestConfig(overrides = {}) {
  const cfg = JSON.parse(JSON.stringify(TEST_CONFIG));
  Object.assign(cfg, overrides);
  fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

export async function startTestServer(opts = {}) {
  vi.resetModules();

  const passwordHash = opts.noPassword ? '' : await hashPassword(opts.password || 'correct-horse');
  writeTestConfig({ ...opts.config, auth: { passwordHash } });

  const serverMod = await import('../src/server');
  await serverMod.loadConfiguration();
  const { app, server } = serverMod.createApp();
  const pmRef = serverMod.pm;

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const jar = new Map();
  async function request(method, urlPath, { body, headers = {}, raw = false } = {}) {
    const h = { ...headers };
    if (body !== undefined && !(body instanceof FormData)) {
      h['Content-Type'] = h['Content-Type'] || 'application/json';
    }
    if (jar.size) {
      h.Cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const res = await fetch(base + urlPath, {
      method,
      headers: h,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of sc) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      jar.set(k.trim(), v.trim());
    }
    if (raw) return res;
    let json = null;
    try { json = await res.json(); } catch { /* binary or empty */ }
    return { status: res.status, body: json, headers: res.headers, raw: res };
  }

  async function login(password = 'correct-horse') {
    return request('POST', '/api/login', { body: { password } });
  }

  async function close() {
    await pmRef.stopAllProjects();
    await new Promise((resolve) => server.close(resolve));
  }

  return { app, server, base, request, login, close, jar };
}

export function tmpdir(prefix = 'sm-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export { writeTestConfig, TEST_CONFIG };
