import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { startTestServer, tmpdir } from './helpers';

describe('security regressions', () => {
  let srv;
  let workdir;

  beforeAll(async () => {
    workdir = tmpdir('sm-sec-');
    srv = await startTestServer();
    await srv.login();
  });

  afterAll(async () => {
    await srv.close();
    try { fs.rmSync(workdir, { recursive: true, force: true }); } catch { /* best-effort cleanup on Windows */ }
  });

  it('T-SEC-3 (S-2): file read allows absolute paths (D-2 policy) but normalizes traversal', async () => {
    const ok = await srv.request('POST', '/api/file/read', {
      body: { path: path.join(workdir, 'normal.txt') },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(false);

    fs.writeFileSync(path.join(workdir, 'normal.txt'), 'hello');
    const read = await srv.request('POST', '/api/file/read', {
      body: { path: path.join(workdir, 'normal.txt') },
    });
    expect(read.body.success).toBe(true);
    expect(read.body.content).toBe('hello');

    const viaDots = await srv.request('POST', '/api/file/read', {
      body: { path: path.join(workdir, 'sub', '..', 'normal.txt') },
    });
    expect(viaDots.body.success).toBe(true);
  });

  it('T-SEC-3b: allowedRoots confinement (when configured) blocks escape', async () => {
    const confined = await startTestServer({
      config: { security: { allowedRoots: [workdir], enforceAuth: true } },
    });
    await confined.login();

    const inside = await confined.request('POST', '/api/file/read', {
      body: { path: path.join(workdir, 'normal.txt') },
    });
    expect(inside.body.success).toBe(true);

    const outside = await confined.request('POST', '/api/file/read', {
      body: { path: '/etc/passwd' },
    });
    expect(outside.status).toBe(400);
    expect(outside.body.success).toBe(false);

    const escape = await confined.request('POST', '/api/file/read', {
      body: { path: path.join(workdir, '..', path.basename(workdir) + 'x', 'nope.txt') },
    });
    expect(escape.status).toBe(400);

    await confined.close();
  });

  it('T-SEC-4 (S-3 regression): upload sanitizes traversal filenames', async () => {
    const fd = new FormData();
    const blob = new Blob(['evil-content'], { type: 'text/plain' });
    fd.append('file', blob, '../../../evil.txt');
    fd.append('directory', workdir);

    const res = await srv.request('POST', '/api/file/upload', { body: fd });
    expect(res.body.success).toBe(true);

    expect(fs.existsSync(path.join(workdir, 'evil.txt'))).toBe(true);
    expect(fs.existsSync(path.join(path.dirname(workdir), 'evil.txt'))).toBe(false);
  });

  it('T-SEC-5: rejects cross-origin state-changing requests', async () => {
    const res = await srv.request('POST', '/api/projects', {
      body: { name: 'x', path: '/tmp', command: 'true' },
      headers: { Origin: 'http://evil.example.com' },
    });
    expect(res.status).toBe(403);
  });

  it('T-SEC-6 (S-5 direction): project name with HTML is stored as data and returned as JSON', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const res = await srv.request('POST', '/api/projects', {
      body: { name: payload, path: '/tmp', command: 'true' },
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(payload);
    expect(res.headers.get('content-type')).toContain('application/json');

    await srv.request('DELETE', `/api/projects/${res.body.id}`);
  });

  it('T-SEC-7: file write refuses empty/invalid paths', async () => {
    const res = await srv.request('POST', '/api/file/write', { body: { path: '', content: 'x' } });
    expect(res.status).toBe(400);
  });

  it('T-SEC-8: execute rejects missing directory', async () => {
    const res = await srv.request('POST', '/api/execute', { body: { directory: '', command: 'ls' } });
    expect(res.status).toBe(400);
  });
});
