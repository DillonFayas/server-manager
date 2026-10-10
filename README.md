# Server Manager

A web-based dashboard for managing and monitoring long-running projects (services, apps, scripts) on a Linux server or Raspberry Pi. Start/stop/restart projects, watch live logs, browse and edit files, and run shell commands — from any device on your network.

## Features

- **Project management** — register projects (name, path, start command, tags), start/stop/restart them, git-pull updates, restart-all.
- **Live monitoring** — real-time CPU/memory/uptime metrics and status over WebSocket; crash counting with dismissible alerts and email notifications.
- **Live logs** — streamed log viewer with deduplication, timestamps, filtering, export, and clear.
- **File manager** — browse directories, view/edit/save files, download, upload (drag & drop), with an integrated terminal.
- **Command runner** — execute shell commands in any directory with history and a "save as project" shortcut.
- **Authentication** — single-password session auth with rate limiting; every API route and WebSocket upgrade requires a valid session.
- **Dark/light theme** — persisted per browser.

## Requirements

- Node.js ≥ 18 (tested on 18/20/24)
- Linux or macOS for full process-management support (Windows works for development; process-tree kill uses `taskkill` there)

## Quick start

```bash
# 1. Install backend dependencies
npm install

# 2. Set an admin password (writes the bcrypt hash into config.json)
npm run setup

# 3. Build the React frontend (once, or after frontend changes)
npm run build

# 4. Start
npm start
```

Open `http://<server>:5000` and log in with the password you chose.

### Development

```bash
npm run dev            # backend with nodemon
npm run dev:frontend   # Vite dev server on :5173 (proxies /api and WebSockets to :5000)
```

The Vite dev server proxies `/api`, `/status`, and `/logs` to the backend, so you can develop the UI with hot reload against a locally running `npm run dev`.

### Tests

```bash
npm test           # run the backend test suite once
npm run test:watch # watch mode
```

## Configuration

Configuration lives in `config.json` (created/updated by `npm run setup`). **Do not commit this file** — it contains the password hash and optional SMTP credentials.

| Key | Description |
|---|---|
| `server.port` / `server.host` | Bind address (defaults `5000` / `0.0.0.0`). Overridable with `PORT` / `HOST` env vars. |
| `auth.passwordHash` | bcrypt hash of the login password. Empty = login disabled (fails closed with 503). |
| `session.secret` | Session cookie signing secret. Auto-generated if missing; override with `SESSION_SECRET`. |
| `security.allowedRoots` | Optional array of absolute path prefixes. When non-empty, all file operations are confined to these roots. Empty (default) = unrestricted (original behavior). |
| `execute.timeoutMs` | Max runtime for `/api/execute` commands (default 60000). |
| `email.*` | SMTP settings for crash-alert emails (`enabled`, `service`, `user`, `pass`, `recipient`). Overridable with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. |
| `projects` | Managed project list. Runtime fields (`status`, `stats`, `health`) are stripped on load and stored only in memory. |

Environment variable overrides (useful for containers/CI): `PORT`, `HOST`, `SESSION_SECRET`, `CONFIG_PATH`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

## Architecture

```
server.js            # thin entrypoint → src/server.js
src/
  server.js          # Express app: helmet CSP, session, CSRF origin check, static, WS attach
  config.js          # config load/save/migrate (atomic writes, mode 0600)
  auth.js            # session middleware, login (rate-limited), requireAuth
  validation.js      # zod schemas + validate/validateParams middleware
  paths.js           # path containment (optional allowedRoots), upload-name sanitization
  audit.js           # append-only JSONL audit log (audit.log)
  ws.js              # /status broadcast + /logs/:id streams, session-checked upgrades
  routes/
    projects.js      # CRUD, start/stop/restart/restart-all, git update, clear-logs
    files.js         # list/read/write/download/upload
    execute.js       # shell execution with timeout + audit
  services/
    processManager.js # child-process lifecycle, stats sampling, log buffers, health
    email.js          # nodemailer crash alerts
frontend/            # React + TypeScript + Vite + Tailwind + shadcn/ui
  src/
    App.tsx, main.tsx
    pages/           # LoginPage, DashboardPage, FileManagerPage
    components/      # AppShell, ProjectCard, dialogs, ui/ primitives
    hooks/           # useSession, useProjects, usePreferences
    lib/             # typed API client, WS helper, utils
tests/               # vitest + supertest backend suite
```

See `ARCHITECTURE.md` for more detail and `SECURITY.md` for the threat model.

## API overview

All endpoints require an authenticated session (except `POST /api/login`). State-changing requests are additionally rejected cross-origin.

| Method & path | Purpose |
|---|---|
| `POST /api/login` | Password login (rate-limited) |
| `POST /api/logout` | Destroy session |
| `GET /api/session` | Check authentication |
| `GET /api/projects` | List projects (with live status/stats/health) |
| `POST /api/projects` | Create project |
| `PUT /api/projects/:id` | Update project (allow-listed fields only) |
| `DELETE /api/projects/:id` | Delete project |
| `POST /api/projects/:id/start` \| `/stop` \| `/restart` | Lifecycle |
| `POST /api/projects/restart-all` | Restart every running project |
| `POST /api/projects/:id/update` | `git pull` in the project directory |
| `POST /api/projects/:id/clear-logs` | Clear buffered logs |
| `POST /api/file/list` | Directory listing |
| `POST /api/file/read` \| `/write` \| `/download` \| `/upload` | File operations |
| `POST /api/execute` | Run a shell command (timeout-limited) |
| `WS /status` | Project status stream |
| `WS /logs/:id` | Project log stream |

## Upgrading from the original (pre-modernization) version

- **Authentication is now enforced on every route and WebSocket.** Scripts that called the API without logging in must first `POST /api/login` and send the `sm.sid` cookie.
- `POST /api/projects/:id/update` is now the git-update endpoint (the old ambiguous `/api/projects/update` is gone).
- `POST /api/file/list` replaces the previous `ls`-parsing approach in the file manager.
- Runtime fields (`status`, `stats`, `health`) can no longer be set via the API (mass-assignment is rejected).
- Uploaded filenames are sanitized (traversal sequences stripped).
- `config.json` gained `security.allowedRoots`, `session.secret`, and `execute.timeoutMs`; old configs are migrated automatically on load.

## License

ISC
