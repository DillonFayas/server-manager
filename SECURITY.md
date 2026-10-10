# Security

## Threat model

Server Manager runs as a privileged process on a host and, once authenticated, can start/stop arbitrary processes, read/write arbitrary files (subject to `allowedRoots`), and execute arbitrary shell commands. The security goal is therefore **not** to sandbox an untrusted admin — it is to ensure that:

1. Only someone who knows the password can reach any of those capabilities (authn).
2. A network attacker cannot ride an authenticated browser session (CSRF, session fixation).
3. XSS in the UI cannot be used to execute admin actions in the operator's browser (output encoding).
4. Configuration and secrets are not leaked through the repo, the API, or world-readable files.
5. Common footguns (mass assignment, path traversal in uploads, unbounded command runtime) are closed.

## Controls implemented

### Authentication & sessions (`src/auth.js`)
- Single-password auth via bcrypt (`$2b$`, cost 10) comparison with `timingSafeEqual`-style handling through bcrypt's own compare.
- Session cookie `sm.sid`: `httpOnly`, `sameSite: 'lax'`, `secure` auto-set behind HTTPS detection, 7-day rolling expiry, random `sid` regenerated on login (fixation defense).
- `requireAuth` guard applied to **every** `/api/*` route (except login/session-check) and to WebSocket upgrades (unauthenticated upgrades receive a 401 close).
- Login rate limit: 5 failed attempts per IP per 15 minutes → 429.
- **Fail closed**: if `auth.passwordHash` is empty, login returns 503 rather than allowing a bypass.

### CSRF (`src/server.js`)
- Defense in depth on top of `SameSite=Lax`: state-changing methods (POST/PUT/PATCH/DELETE) carrying an `Origin` header are rejected (403) when the origin's host doesn't match `Host`.

### XSS (`frontend/`)
- React (JSX text content is encoded by default) — the previous `innerHTML`-based UI (S-5, ISSUE-026 family) is gone.
- No `dangerouslySetInnerHTML` anywhere in the frontend.
- Backend returns JSON only for API routes; file downloads use `Content-Disposition` with the basename.
- CSP via helmet: `default-src 'self'`, no CDN origins (removed after Bootstrap deletion), `connect-src 'self' ws: wss:`.

### Input validation (`src/validation.js`)
- Zod schemas for every body/param; `.strict()` rejects unknown keys.
- Project updates are allow-listed (name/path/command/tags/autoRestart/emailOnCrash). `status`, `stats`, `health`, `id` are rejected (fixes S-6 mass assignment).
- Length caps on all string inputs (names 200, paths 4096, commands 8192, file content 10 MB).

### Path handling (`src/paths.js`, `src/routes/files.js`)
- `resolveContained()` normalizes absolute paths; with `security.allowedRoots` configured it `realpath`s both the target and the roots and requires containment (blocks `../` traversal and symlink escapes — S-2/S-3).
- Upload filenames are sanitized (`sanitizeUploadName`): basenamed, control chars stripped, dot-only names rejected; containment re-checked after join.
- `EXDEV` rename fallback (cross-device temp dirs) copies then removes the temp file.
- Git-update blocks shell metacharacters in project paths before interpolation.

### Command execution (`src/routes/execute.js`)
- Runs only for authenticated users (decision D-3), audited, with a hard timeout (default 60 s, configurable) after which the process is killed.
- `HOME` is set to the real user home (was hardcoded `/home/dilly`).
- Git commands get `safe.directory` registration to avoid ownership errors.

### Secrets & configuration
- `config.json` is git-ignored; never committed.
- Config writes are atomic (temp file + rename) with mode `0600`.
- Session secret is auto-generated (crypto random) if missing; overridable via `SESSION_SECRET`.
- SMTP password only ever read from config/env; never logged or returned by the API.
- Audit log records actor, action, target, and success for privileged operations.

### Process management (`src/services/processManager.js`)
- Process-tree kill on stop (POSIX: `pgrep` + SIGTERM → SIGKILL escalation; Windows: `taskkill /T /F`).
- Auto-restart is boot-time only (original semantics preserved); crash-restart loops are not introduced.

## Known limitations / accepted risks (decisions)

- **D-1**: Every route requires auth. There is no anonymous read-only mode. API consumers must log in.
- **D-2**: `allowedRoots` defaults to empty (unrestricted), matching the original app's behavior. Operators who want confinement must configure it. The app is designed for a trusted admin on a trusted LAN; if exposed beyond that, configure `allowedRoots` and terminate TLS.
- **D-3**: Arbitrary shell execution remains available to authenticated users (it is a core feature of the tool); it is rate-of-execution bounded by the timeout and audited, but there is no command allowlist.
- The UI does not implement per-user RBAC — there is one password and therefore one privilege level.
- Rate limiting is per-IP in-memory (resets on restart; no distributed store).
- WebSocket log streams are unpaginated (bounded by the 1000-line ring buffer).

## Reporting

Open an issue on the repository. Do not include live credentials or a real `config.json` in reports.
