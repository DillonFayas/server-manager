# Architecture

## Overview

Server Manager is a single Node.js process that:

1. Serves a React SPA (static assets from `frontend/dist`).
2. Exposes a JSON API under `/api/*` for project lifecycle, file operations, and command execution.
3. Streams project status and logs over WebSockets (`/status`, `/logs/:projectId`).
4. Manages child processes (the user's projects) with live stats sampling and crash tracking.

```
Browser (React SPA)
   │  fetch /api/*  (session cookie)
   │  WebSocket /status, /logs/:id
   ▼
Express app (src/server.js)
   ├─ helmet CSP  → security headers, no CDN origins
   ├─ session     → express-session, cookie sm.sid (httpOnly, SameSite=Lax)
   ├─ CSRF guard  → reject state-changing requests with mismatched Origin
   ├─ routes/     → projects, files, execute (all behind requireAuth)
   ├─ ws.js       → upgrade handler re-uses the session middleware
   └─ static      → frontend/dist + SPA fallback
   ▼
services/processManager.js
   ├─ spawn/kill project processes (shell:true)
   ├─ 1 Hz stats sampling (ps/pgrep on POSIX, taskkill-aware on Windows)
   ├─ log ring buffers (1000 lines/project)
   └─ health tracking (crash count, last crash, optional email)
```

## Backend modules

| Module | Responsibility |
|---|---|
| `src/server.js` | App composition, middleware order, listen/auto-start ordering (B-5/B-6 fix: listen first, auto-start async), graceful shutdown (B-7 fix), 1 Hz stats interval. |
| `src/config.js` | Load/save `config.json` (path overridable via `CONFIG_PATH`). Deep-merges defaults, migrates old configs (strips runtime-pollution keys from persisted projects), env-var overrides, atomic writes with mode `0600`, auto-generated session secret. |
| `src/auth.js` | Session middleware factory, login route (bcrypt compare, 5-attempt/15-min rate limit per IP, 503 when no hash configured — fail closed), logout, session check, `requireAuth` guard. |
| `src/validation.js` | Zod schemas for every request body and URL param. `validate()` middleware replaces `req.body` with parsed data; `validateParams()` validates `req.params`. Strict schemas reject unknown keys (blocks mass assignment, S-6). |
| `src/paths.js` | `resolveContained()`: normalizes absolute paths; when `security.allowedRoots` is non-empty, resolves symlinks via `realpath` and requires the result to live under an allowed root (prevents `../` and symlink escapes, S-2/S-3). `sanitizeUploadName()` strips traversal from upload filenames. |
| `src/audit.js` | Append-only JSONL audit log (`audit.log`): actor IP, session id prefix, action, target, detail, success flag. Used for execute, file writes/uploads, project lifecycle. |
| `src/ws.js` | Attaches to the HTTP server's `upgrade` event; runs the session middleware on the upgrade request and rejects unauthenticated sockets with a 401 close. `broadcastStatus` fans out to all `/status` clients; `/logs/:id` streams a project's ring buffer then live lines. |
| `src/routes/projects.js` | CRUD + lifecycle. Restart-all references its project list outside `try` (B-1 fix). PUT allow-lists writable fields only. Git update uses `os.homedir()` for `HOME` (was hardcoded `/home/dilly`) and blocks shell metacharacters in paths. |
| `src/routes/files.js` | `list` (replaces shelling out to `ls`), `read`, `write`, `download` (POST, triggers `res.download`), `upload` (multer temp → sanitized name → containment re-check → rename with EXDEV fallback). |
| `src/routes/execute.js` | Spawns the command in the requested directory with a configurable timeout (default 60 s), audited, git-safe-directory handling for `git` commands. |
| `src/services/processManager.js` | Module-level Maps for processes/stats/logs/health. `startProject` spawns with `shell:true`, wires stdout/stderr into the ring buffer, counts non-zero exits as crashes (respecting a "restarting" flag), optionally emails. `stopProject` kills the process tree (POSIX: pgrep+SIGTERM/SIGKILL escalation; Windows: `taskkill /T /F`). Stats sampled at 1 Hz. |
| `src/services/email.js` | Nodemailer transport built from config; `sendCrashEmail` is best-effort and never blocks the exit handler. |

## Frontend

React 18 + TypeScript + Vite + Tailwind + shadcn/ui (Radix primitives) + Lucide icons.

- `hooks/useSession` — session context; gates routing (login vs app).
- `hooks/useProjects` — project list state; subscribes to `/status` WS with 5 s reconnect; exposes lifecycle actions.
- `hooks/usePreferences` — localStorage-backed theme/bool/JSON preferences (parity with the old app's keys).
- `lib/api` — typed fetch client; throws `ApiError` with backend message; `connectWs` helper with reconnect predicate; form-based download (POST with cookies).
- `pages/LoginPage` — password form.
- `pages/DashboardPage` — project grid, tag filter, metrics toggles, modals (add/edit, delete, restart-all, update result, logs, command).
- `pages/FileManagerPage` — three-pane browser/terminal/editor.
- `components/ui/*` — shadcn-style primitives (Button, Input, Label, Card, Badge, Dialog, DropdownMenu, Switch).

Build output goes to `frontend/dist`, served statically by Express with an SPA fallback to `index.html` for non-`/api` GETs.

## Data flow notes

- Project `status`/`stats`/`health` are runtime-only; `config.json` persists only user-editable fields (migration strips old pollution on load).
- Log buffers live in memory (1000 lines/project cap); "clear logs" empties the buffer and broadcasts nothing.
- Crash alerts increment on non-zero exit while not marked "restarting"; the client can dismiss an alert locally (localStorage) without mutating server state.

## Process & lifecycle ordering

`main()` loads config → inits email → `createApp()` → binds the port (fails fast on EADDRINUSE) → starts the 1 Hz stats interval → auto-starts `autoRestart` projects async → registers SIGTERM/SIGINT handlers that stop all managed children before closing the server.

## Testing

Backend: Vitest + Supertest. `tests/helpers.js` boots the real Express app on an ephemeral port with an isolated `CONFIG_PATH`, a known bcrypt password, and a cookie-jar fetch wrapper. Suites cover auth (T-AUTH-*), the 15-route 401 sweep (T-SEC-1), project CRUD/lifecycle incl. B-1/S-6 regressions, file ops incl. upload-traversal sanitization (T-SEC-4) and B-2 download, execute timeout, allowedRoots confinement, CSRF origin rejection, and pure units (formatUptime, sanitizeUploadName, config migration).
