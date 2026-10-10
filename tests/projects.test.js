import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, tmpdir } from './helpers';

// Cross-platform long-running command: run node with a never-ending interval.
const LONG_CMD = `"${process.execPath}" -e "setInterval(function(){},1000)"`;

describe('project CRUD + lifecycle', () => {
  let srv;
  let workdir;

  beforeAll(async () => {
    workdir = tmpdir('sm-proj-');
    srv = await startTestServer();
    await srv.login();
  });

  afterAll(async () => {
    await srv.close();
    const fs = await import('fs');
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('T-PROJ-1: empty project list', async () => {
    const res = await srv.request('GET', '/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('T-PROJ-12: creates a project with all fields', async () => {
    const res = await srv.request('POST', '/api/projects', {
      body: {
        name: 'Test Project',
        path: workdir,
        command: LONG_CMD,
        tags: ['web', 'test'],
        autoRestart: false,
        emailOnCrash: false,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(/^[0-9a-f]{16}$/);
    expect(res.body.name).toBe('Test Project');

    const list = await srv.request('GET', '/api/projects');
    expect(list.body.length).toBe(1);
    expect(list.body[0].status).toBe('stopped');
    expect(list.body[0].stats).toEqual({ cpu: 0, memory: 0, uptime: '0s' });
    expect(list.body[0].health).toEqual({ crashCount: 0, lastCrash: null });
  });

  it('T-PROJ-7/8/9: start, verify running, stop', async () => {
    const list = await srv.request('GET', '/api/projects');
    const id = list.body[0].id;

    const start = await srv.request('POST', `/api/projects/${id}/start`);
    expect(start.body.success).toBe(true);

    const after = await srv.request('GET', '/api/projects');
    expect(after.body[0].status).toBe('running');

    const again = await srv.request('POST', `/api/projects/${id}/start`);
    expect(again.body.success).toBe(false);

    const stop = await srv.request('POST', `/api/projects/${id}/stop`);
    expect(stop.body.success).toBe(true);

    const final = await srv.request('GET', '/api/projects');
    expect(final.body[0].status).toBe('stopped');
  });

  it('T-PROJ-13: updates a project (partial)', async () => {
    const list = await srv.request('GET', '/api/projects');
    const id = list.body[0].id;
    const res = await srv.request('PUT', `/api/projects/${id}`, {
      body: { name: 'Renamed', tags: ['updated'] },
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
    expect(res.body.tags).toEqual(['updated']);
    expect(res.body.path).toBe(workdir);
  });

  it('T-SEC-2 (S-6 regression): rejects mass-assignment of runtime keys', async () => {
    const list = await srv.request('GET', '/api/projects');
    const id = list.body[0].id;
    const res = await srv.request('PUT', `/api/projects/${id}`, {
      body: {
        name: 'Still Fine',
        status: 'running',
        stats: { cpu: 99 },
        health: { crashCount: 99 },
        id: 'deadbeefdeadbeef',
      },
    });
    expect(res.status).toBe(400);
    const after = await srv.request('GET', '/api/projects');
    const p = after.body.find((x) => x.id === id);
    expect(p.id).toBe(id);
    expect(p.name).not.toBe('Still Fine');
  });

  it('T-PROJ-14: deletes a project', async () => {
    const list = await srv.request('GET', '/api/projects');
    const id = list.body[0].id;
    const res = await srv.request('DELETE', `/api/projects/${id}`);
    expect(res.body.success).toBe(true);
    const after = await srv.request('GET', '/api/projects');
    expect(after.body.length).toBe(0);
  });

  it('T-PROJ-10 (B-1 regression): restart-all returns success without throwing', async () => {
    const res = await srv.request('POST', '/api/projects/restart-all');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('validates project input', async () => {
    const bad = await srv.request('POST', '/api/projects', {
      body: { name: '', path: '', command: '' },
    });
    expect(bad.status).toBe(400);

    const badId = await srv.request('POST', '/api/projects/not-a-hex-id/start');
    expect(badId.status).toBe(400);
  });
});
