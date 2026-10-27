# Testing

## Running

```bash
npm test           # single run (CI)
npm run test:watch # watch mode
```

Backend only; the frontend is verified by `npm run build` (strict TypeScript + Vite production build) plus manual/E2E checks (see below).

## Stack

- **Vitest** — test runner (ESM, `vi.resetModules()` for per-server module isolation).
- **Supertest-style via fetch** — `tests/helpers.js` boots the real `createApp()` on an ephemeral port with an isolated `CONFIG_PATH` pointing at a temp config, known bcrypt password, and a cookie-jar `request()` wrapper that auto-attaches the session cookie and parses JSON.

## Layout

```
tests/
  helpers.js       # startTestServer(opts), tmpdir(), cookie-jar fetch, TEST_CONFIG
  auth.test.js     # T-AUTH-1/2, T-SEC-1 (401 sweep), rate limit, fail-closed 503
  projects.test.js # T-PROJ-1/7/8/9/10/12/13/14/15/16/17, B-1 regression, S-6 regression, validation
  files.test.js    # T-FM-2/4/5/6, T-CMD-4, execute timeout, T-LOG-8
  security.test.js # T-SEC-2..8 (traversal, upload sanitization, CSRF origin, XSS-as-data)
  unit.test.js     # T-UNIT-1 formatUptime, T-UNIT-2 sanitizeUploadName, T-UNIT-3 config migration
```

## What is covered

| Area | Cases |
|---|---|
| Auth | wrong password → 401; correct password → session cookie; logout → subsequent 401; unauthenticated access → 401 on all 15 protected routes; login rate limit → 429 after 6 failures; empty `passwordHash` → 503 (fail closed). |
| Projects | empty list; create with all fields (id format, defaults, status/stats/health injected); start/stop lifecycle (running ↔ stopped); partial update preserves unspecified fields; mass-assignment of `status`/`stats`/`health`/`id` → 400 (S-6); delete; restart-all returns success without throwing (B-1 regression); invalid id/body → 400. |
| Files | list sorted dirs-first with metadata; read; write; download via POST returns content (B-2 regression); upload sanitizes `../../../evil.txt` to `evil.txt` inside the target dir (S-3); empty path → 400. |
| Security | unauthenticated 401 sweep; cross-origin state-changing request → 403 (CSRF); HTML in project name stored/returned as JSON data (XSS direction, S-5); `allowedRoots` confinement allows inside paths and blocks outside/escape paths (D-2); traversal normalization for reads. |
| Execute | successful command returns output; long command killed at timeout with "timed out"; nonexistent directory → 400; clear-logs works for any id (T-LOG-8). |
| Units | `formatUptime` exact format (0s/59s/1m 0s/1h 0m 0s/1d 1h 1m 1s/1w…/2w…); `sanitizeUploadName` strips traversal/absolute/dot-only/separator names; config migration strips runtime keys, applies env overrides, sets defaults. |

## Frontend verification

There is no frontend unit-test harness yet; the build gate is:

```bash
npm run build   # tsc -b (strict) && vite build
```

Manual/E2E checklist (mirrors the feature-preservation table in IMPLEMENTATION_PLAN.md): login/logout, theme persistence, project CRUD, start/stop/restart/restart-all, tag filter, metrics toggles, crash dismiss, email switch, logs modal (stream/dedup/filter/export/clear), command modal (cd/history/save-as-project), file manager (browse/upload/edit/save/download/terminal).

## CI notes

- Tests spawn real child processes (`node -e "setInterval(...)"`); they are killed via the process manager's tree-kill (POSIX `pgrep`/`taskkill` on Windows).
- Each `startTestServer()` call `vi.resetModules()` and re-imports the backend so config/route singletons don't leak between servers.
- Unique temp `CONFIG_PATH` per process prevents test cross-talk.
- `bcrypt` install scripts are approved via `allowScripts` in package.json; the hash format is `$2b$` (60 chars).

## Adding tests

1. Use `startTestServer()` from `tests/helpers.js` — never instantiate Express by hand in tests.
2. Name tests with the spec ID (`T-XXX-n`) used in SYSTEM_SPECIFICATION.md / IMPLEMENTATION_PLAN.md when covering a documented behavior or regression.
3. For regressions, reference the finding id in the test name (e.g. `T-SEC-2 (S-6 regression): ...`).

## Linux process lifecycle regression tests

Run `node --test tests/process-lifecycle.linux.cjs` with a native Linux Node runtime.
These exercise nested shell/Node descendants, SIGTERM-resistant workers, wrapper crashes,
stop/start overlap, unexpected signals, and intentional stops. Windows skips these tests.
