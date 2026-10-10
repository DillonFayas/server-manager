import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('pure units', () => {
  it('T-UNIT-1: formatUptime preserves original format', async () => {
    const pm = await import('../src/services/processManager');
    expect(pm.formatUptime(0)).toBe('0s');
    expect(pm.formatUptime(59)).toBe('59s');
    expect(pm.formatUptime(60)).toBe('1m 0s');
    expect(pm.formatUptime(3600)).toBe('1h 0m 0s');
    expect(pm.formatUptime(90061)).toBe('1d 1h 1m 1s');
    expect(pm.formatUptime(604800)).toBe('1w 0d 0h 0m 0s');
    expect(pm.formatUptime(1209661)).toBe('2w 0d 0h 1m 1s');
  });

  it('T-UNIT-2: sanitizeUploadName strips traversal', async () => {
    const { sanitizeUploadName } = await import('../src/paths');
    expect(sanitizeUploadName('normal.pdf')).toBe('normal.pdf');
    expect(sanitizeUploadName('../../../etc/passwd')).toBe('passwd');
    expect(sanitizeUploadName('/absolute/path.txt')).toBe('path.txt');
    expect(sanitizeUploadName('..')).toBe('');
    expect(sanitizeUploadName('a/b\\c.txt')).toBe('c.txt');
  });

  it('T-UNIT-3: config migration strips runtime keys from projects', async () => {
    const tmp = path.join(os.tmpdir(), `sm-migrate-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmp, JSON.stringify({
      server: { port: 5001 },
      projects: [{
        id: 'abc123abc123abcd',
        name: 'p',
        path: '/tmp',
        command: 'x',
        status: 'running',
        stats: { cpu: 1 },
        health: { crashCount: 5 },
      }],
    }));
    const prevConfigPath = process.env.CONFIG_PATH;
    const prevSecret = process.env.SESSION_SECRET;
    process.env.CONFIG_PATH = tmp;
    process.env.SESSION_SECRET = 'unit-test-secret';
    vi.resetModules();
    const cfg = await import('../src/config');
    await cfg.loadConfiguration();
    const loaded = cfg.getConfig();
    expect(loaded.server.port).toBe(5001);
    expect(loaded.projects[0].status).toBeUndefined();
    expect(loaded.projects[0].stats).toBeUndefined();
    expect(loaded.projects[0].health).toBeUndefined();
    expect(loaded.security.allowedRoots).toEqual([]);
    expect(loaded.execute.timeoutMs).toBe(60000);
    expect(loaded.session.secret).toBe('unit-test-secret');
    fs.rmSync(tmp, { force: true });
    process.env.CONFIG_PATH = prevConfigPath;
    process.env.SESSION_SECRET = prevSecret;
  });
});
