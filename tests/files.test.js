import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { startTestServer, tmpdir } from './helpers';

const LONG_CMD = `"${process.execPath}" -e "setTimeout(function(){},30000)"`;

describe('file operations + execute', () => {
  let srv;
  let workdir;

  beforeAll(async () => {
    workdir = tmpdir('sm-files-');
    fs.writeFileSync(path.join(workdir, 'a.txt'), 'alpha');
    fs.mkdirSync(path.join(workdir, 'sub'));
    fs.writeFileSync(path.join(workdir, 'sub', 'b.txt'), 'beta');
    srv = await startTestServer();
    await srv.login();
  });

  afterAll(async () => {
    await srv.close();
    try { fs.rmSync(workdir, { recursive: true, force: true }); } catch { /* best-effort cleanup on Windows */ }
  });

  it('T-FM-2: /api/file/list returns sorted entries with metadata', async () => {
    const res = await srv.request('POST', '/api/file/list', { body: { path: workdir } });
    expect(res.body.success).toBe(true);
    const names = res.body.entries.map((e) => e.name);
    expect(names).toContain('a.txt');
    expect(names).toContain('sub');
    const subIdx = names.indexOf('sub');
    const aIdx = names.indexOf('a.txt');
    expect(subIdx).toBeLessThan(aIdx);
    const sub = res.body.entries.find((e) => e.name === 'sub');
    expect(sub.isDirectory).toBe(true);
  });

  it('T-FM-4: reads file content', async () => {
    const res = await srv.request('POST', '/api/file/read', {
      body: { path: path.join(workdir, 'a.txt') },
    });
    expect(res.body.success).toBe(true);
    expect(res.body.content).toBe('alpha');
  });

  it('T-FM-5: writes file content', async () => {
    const res = await srv.request('POST', '/api/file/write', {
      body: { path: path.join(workdir, 'a.txt'), content: 'alpha-v2' },
    });
    expect(res.body.success).toBe(true);
    expect(fs.readFileSync(path.join(workdir, 'a.txt'), 'utf8')).toBe('alpha-v2');
  });

  it('T-FM-6 (B-2 regression): downloads a file via POST /api/file/download', async () => {
    const res = await srv.request('POST', '/api/file/download', {
      body: { path: path.join(workdir, 'a.txt') },
      raw: true,
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('alpha-v2');
  });

  it('T-CMD-4: executes a command and returns output', async () => {
    const res = await srv.request('POST', '/api/execute', {
      body: { directory: workdir, command: 'echo hello-from-test' },
    });
    expect(res.body.success).toBe(true);
    expect(res.body.output).toContain('hello-from-test');
  });

  it('execute enforces a timeout', async () => {
    const res = await srv.request('POST', '/api/execute', {
      body: { directory: workdir, command: LONG_CMD },
    });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/timed out/i);
  }, 20000);

  it('execute rejects nonexistent directory', async () => {
    const res = await srv.request('POST', '/api/execute', {
      body: { directory: '/no/such/dir/anywhere', command: 'ls' },
    });
    expect(res.status).toBe(400);
  });

  it('T-LOG-8: clear-logs succeeds for any project id', async () => {
    const res = await srv.request('POST', '/api/projects/abcdef0123456789/clear-logs');
    expect(res.body.success).toBe(true);
  });
});
