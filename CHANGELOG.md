# Changelog

All notable changes to this project are documented here. Dates use ISO format.

## [2.0.0] — 2026-10-09

Modernization release. Backend security/correctness hardening and full frontend rewrite.

### Security

- Enforce session authentication on **every** HTTP route and WebSocket upgrade (D-1). Unauthenticated API/WS access now returns 401.
- Add express-session with `sm.sid` cookie (httpOnly, SameSite=Lax, rolling 7-day expiry); session id regenerated on login.
- Add CSRF defense-in-depth: state-changing requests with a mismatched `Origin` are rejected (403).
- Add helmet with CSP; no CDN origins (Bootstrap removed).
- Add login rate limiting (5 failed attempts / 15 min / IP → 429); login fails closed with 503 when no password hash is configured.
- Add zod validation on every body and URL param; project updates are allow-listed (rejects mass assignment of `status`/`stats`/`health`/`id` — S-6).
- Add optional path confinement via `security.allowedRoots` with symlink-resolving containment checks (D-2); unrestricted by default to preserve original behavior.
- Sanitize upload filenames (strip traversal sequences, control chars — S-3).
- Frontend rewritten in React: XSS-by-`innerHTML` class of bugs (S-5) removed by construction (no `dangerouslySetInnerHTML`).
- Atomic `config.json` writes with mode `0600`; session secret auto-generated; secrets git-ignored.

### Added

- `POST /api/file/list` — safe directory listing (replaces client-side `ls` parsing).
- `GET /api/session` — authentication check for the SPA.
- Audit log (`audit.log`, JSONL) for privileged actions (execute, file writes/uploads, project lifecycle).
- Execute command timeout (`execute.timeoutMs`, default 60 s).
- Config migration on load (strips runtime-pollution keys from persisted projects; applies env overrides).
- Backend test suite (Vitest + Supertest): 32 tests covering auth, projects, files, security regressions, and pure units.
- React SPA (`frontend/`): login, dashboard (project grid, tag filter, metrics, crash alerts, modals), file manager (browser, terminal, editor), live logs, command runner, dark/light theme.
- Root scripts: `npm run build` (frontend), `npm run dev:frontend` (Vite dev server with API/WS proxy).
- Documentation: README, ARCHITECTURE, TESTING, SECURITY, this changelog.

### Fixed

- Restart-all `ReferenceError` (B-1): project list declared outside `try` so the catch block can reference it.
- File download was broken in the old UI (`downloadCurrentFile`/`downloadFile` undefined — B-2); download now implemented and covered by a test.
- Dead file context menu (B-3); replaced with working UI.
- Auto-start ordering (B-5/B-6): port is bound before auto-start so the UI is reachable immediately and port conflicts fail fast.
- Graceful shutdown (B-7): SIGTERM/SIGINT stop all managed children before closing the server.
- Git update: `HOME` no longer hardcoded to `/home/dilly` (uses `os.homedir()`).
- Old frontend mass-assignment bug in `toggleEmailAlerts` (sent the whole project object; now sends only the changed field).

### Changed

- **Breaking (with notice):** all API routes require a session. Consumers must `POST /api/login` and send the `sm.sid` cookie.
- **Breaking (with notice):** `POST /api/projects/:id/update` replaces the old ambiguous `POST /api/projects/update`.
- **Breaking (with notice):** request validation failures return 400 with a structured error; runtime-mass-assignment is rejected.
- Project `status`/`stats`/`health` are runtime-only and no longer persisted; old configs are migrated on load.
- Express serves only `frontend/dist`; SPA fallback for non-API GETs.

### Removed

- Bootstrap and bootstrap-icons (CDN); replaced by Tailwind + shadcn/ui + Lucide.
- Old vanilla-JS frontend (`public/index.html`, `public/js/*`, `public/styles.css`) — feature parity migrated to React.
- Hardcoded `/home/dilly` defaults in backend code.

## [1.0.0] — original

Original release: Express backend + vanilla-JS/Bootstrap frontend, single-password bcrypt auth, project lifecycle, file manager (with known broken download and XSS-prone innerHTML rendering), command runner, WebSocket logs/status.
