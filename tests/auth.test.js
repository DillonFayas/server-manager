import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer } from './helpers';

describe('authentication', () => {
  let srv;

  beforeAll(async () => {
    srv = await startTestServer();
  });

  afterAll(async () => {
    await srv.close();
  });

  it('T-AUTH-1: rejects wrong password with 401', async () => {
    const res = await srv.request('POST', '/api/login', { body: { password: 'wrong' } });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('T-AUTH-1: accepts correct password and sets session cookie', async () => {
    const res = await srv.login();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(srv.jar.has('sm.sid')).toBe(true);
  });

  it('T-SEC-1: rejects unauthenticated access to every protected route', async () => {
    const fresh = await startTestServer();
    const routes = [
      ['GET', '/api/projects'],
      ['POST', '/api/projects'],
      ['PUT', '/api/projects/abcdef0123456789'],
      ['DELETE', '/api/projects/abcdef0123456789'],
      ['POST', '/api/projects/abcdef0123456789/start'],
      ['POST', '/api/projects/abcdef0123456789/stop'],
      ['POST', '/api/projects/abcdef0123456789/restart'],
      ['POST', '/api/projects/abcdef0123456789/clear-logs'],
      ['POST', '/api/projects/abcdef0123456789/update'],
      ['POST', '/api/projects/restart-all'],
      ['POST', '/api/file/read'],
      ['POST', '/api/file/write'],
      ['POST', '/api/file/download'],
      ['POST', '/api/file/list'],
      ['POST', '/api/execute'],
    ];
    for (const [method, routePath] of routes) {
      const res = await fresh.request(method, routePath, method === 'GET' ? undefined : { body: {} });
      expect(res.status, `${method} ${routePath} should be 401`).toBe(401);
    }
    await fresh.close();
  });

  it('T-AUTH-2: logout destroys the session', async () => {
    await srv.login();
    const out = await srv.request('POST', '/api/logout');
    expect(out.body.success).toBe(true);
    const res = await srv.request('GET', '/api/projects');
    expect(res.status).toBe(401);
  });

  it('rate-limits repeated failed logins', async () => {
    const limited = await startTestServer();
    for (let i = 0; i < 6; i++) {
      await limited.request('POST', '/api/login', { body: { password: 'nope' } });
    }
    const res = await limited.request('POST', '/api/login', { body: { password: 'correct-horse' } });
    expect(res.status).toBe(429);
    await limited.close();
  });

  it('fails closed (503) when no password hash is configured', async () => {
    const bare = await startTestServer({ noPassword: true });
    const res = await bare.request('POST', '/api/login', { body: { password: 'anything' } });
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    await bare.close();
  });
});
