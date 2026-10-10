# Modernization Report

**Project:** server-manager
**Date:** 2026-10-09
**Scope:** Full-stack modernization per `your-task.md` and `IMPLEMENTATION_PLAN.md` — backend security/correctness hardening, React frontend replacement of the Bootstrap UI, testing, and documentation.

---

## 1. Executive summary

The original server-manager was a functional but insecure single-file Express app with a vanilla-JS/Bootstrap frontend: every API route was unauthenticated, HTML was injected via `innerHTML` (stored XSS), a file download was entirely broken, request bodies were unvalidated (mass assignment), and uploaded filenames were unsanitized. The backend has been rewritten into audited modules with session authentication enforced on every HTTP route and WebSocket upgrade, CSRF origin checks, zod validation on every endpoint, optional path confinement, an audit log, and a 32-test Vitest suite. The Bootstrap frontend has been fully replaced by a React 18 + TypeScript + Vite + Tailwind + shadcn/ui application covering all original features plus a working file editor, directory upload browser, and live log viewer. Bootstrap and all CDN dependencies have been removed; the production bundle is 121 KB gzip.

**Status:** All planned work (F0–F4) is complete and committed. All backend tests pass; the frontend production build passes with strict TypeScript. A few checks that could not be automated in the WSL/Windows environment are documented in §9 and §12.

---

## 2. Original architecture and verified baseline

| Aspect | Verified baseline |
|---|---|
| Runtime | Node.js (Express 4), single process, `config.json` on disk |
| Frontend | Vanilla JS in `public/js/*` + `public/styles.css`, Bootstrap 5 & bootstrap-icons from jsdelivr CDN, DOM built with `innerHTML` string concatenation |
| Auth | Single bcrypt password, but **no session enforcement on API routes** — every endpoint was reachable unauthenticated |
| Process mgmt | `child_process.spawn` with `shell:true`, `ps`-based stats sampling, crash counting, optional SMTP email |
| WebSockets | `/status` (project status broadcast), `/logs/:id` (log stream), both unauthenticated |
| Known defects (pre-existing) | Broken file download (`downloadCurrentFile`/`downloadFile` undefined in `main.js`); dead file context menu; restart-all `ReferenceError` (B-1); hardcoded `/home/dilly` HOME for git; mass-assignment in `toggleEmailAlerts`; auto-start racing port binding |

The original working tree was committed as baseline `9ea7257` before any change.

---

## 3. Security issues identified and remediation status

| ID | Issue | Severity | Status |
|---|---|---|---|
| S-1 / D-1 | No auth on API routes & WS upgrades | Critical | **Fixed** — `requireAuth` on all 15 routes; session-checked WS upgrade with 401 close |
| S-2 | Path traversal / no containment (`../`, symlink escape) | High | **Fixed** — `resolveContained()`; optional `security.allowedRoots` with realpath containment |
| S-3 | Unsanitized upload filenames (traversal) | High | **Fixed** — `sanitizeUploadName()`; test `T-SEC-4` asserts `../../../evil.txt` → `evil.txt` |
| S-5 | Stored XSS via `innerHTML` project names | High | **Fixed** — React encodes text by default; no `dangerouslySetInnerHTML` anywhere |
| S-6 | Mass assignment of `status`/`stats`/`health`/`id` | Medium | **Fixed** — `.strict()` zod schemas; PUT allow-lists writable fields only |
| CSRF | No Origin check; SameSite alone | Medium | **Fixed** — state-changing requests with mismatched Origin → 403 |
| B-5/B-6 | Auto-start raced port binding | Medium | **Fixed** — listen first, then async auto-start; EADDRINUSE fails fast |
| — | Secrets in world-readable config | Medium | **Fixed** — atomic writes, mode `0600`, git-ignored |
| — | No login rate limiting | Medium | **Fixed** — 5 attempts / 15 min / IP → 429 |
| — | Unbounded command runtime | Medium | **Fixed** — `execute.timeoutMs` (default 60 s) + audit log |

**Not vulnerabilities but documented as accepted risks (decisions D-2/D-3):** `allowedRoots` defaults to empty (unrestricted, matching original behavior); arbitrary shell execution remains available to authenticated users (core feature) but is now session-gated, audited, and timeout-bounded. See `SECURITY.md`.

---

## 4. Chosen frontend library and reasons

**React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (Radix primitives) + Lucide icons** (decision D-4).

| Criterion | Reasoning |
|---|---|
| React + TS | Largest ecosystem; JSX eliminates the S-5 XSS class by construction; strict TS catches the family of bugs the old `handlefilemanager.js` had (undefined functions, stringly-typed DOM). |
| Vite | Instant dev server with built-in proxy for `/api` and WebSockets; simple production build to `dist/` that Express serves statically. |
| Tailwind | Design tokens (dark/light via CSS variables) map directly to the old Bootstrap theme variables; utility-first avoids shipping a component library's opinionated markup. |
| shadcn/ui | Copy-in components (no runtime dependency on a package registry), Radix primitives give accessibility (focus traps, ARIA, keyboard nav) that hand-rolled Bootstrap markup lacked. |
| Lucide | Tree-shakeable icon set; replaces bootstrap-icons. |

Alternatives considered: Vue 3 (smaller hiring pool for this project's audience), MUI (heavier bundle, stronger opinion), Svelte (smaller ecosystem). Bootstrap was kept only until F4 per the plan, then removed.

---

## 5. Frontend architecture and design-system changes

```
frontend/src/
  App.tsx, main.tsx           # routing + session gate
  pages/                       # LoginPage, DashboardPage, FileManagerPage
  components/                  # AppShell, ProjectCard, dialogs, StatusBadge, MetricsBars…
  components/ui/               # shadcn-style primitives (Button, Dialog, DropdownMenu, …)
  hooks/                       # useSession (context), useProjects (list + WS), usePreferences
  lib/                         # api.ts (typed client), types.ts, utils.ts (cn, formatFileSize…)
```

- **Design tokens:** `tailwind.config.js` + `src/index.css` define dark/light palettes mirroring the old Bootstrap variables (`--background`, `--primary`, status colors, pulse/spin animations). Theme is persisted in `localStorage` under the same keys the old app used, so existing operator preferences carry over.
- **State:** session context gates routing; project list state lives in `useProjects` (fetch + `/status` WS subscription with 5 s reconnect). No global store — the surface doesn't justify one.
- **API layer:** `lib/api.ts` wraps fetch, throws typed `ApiError` with the backend's message, provides `connectWs` (reconnect predicate) and a form-based download helper (POST with cookies, preserving the B-2 fix).
- **Components:** ProjectCard (context menu, actions, email switch, per-project metrics), ProjectDialog (add/edit with `initial` prefill), LogsDialog (WS stream, dedup ×N, autoscroll, timestamps, filter, export, clear), CommandDialog (dir browser via `POST /api/file/list`, local `cd`, ↑/↓ history, save-as-project), FileManagerPage (three-pane browser / terminal / editor with unsaved-changes guards), ConfirmDialog, UpdateResultDialog, CrashBanner, MetricsBars, StatusBadge.

---

## 6. Bootstrap migration status and remaining dependencies

**Complete.** `public/` (index.html, styles.css, js/*) deleted in commit `a581b8b`. Grep across `src/`, `frontend/src`, `frontend/index.html`, and both `package.json` manifests finds no `bootstrap`/`bootstrap-icons` references. Helmet CSP no longer allows `cdn.jsdelivr.net`; all assets are self-hosted.

**Remaining external dependencies:** none at runtime in the browser beyond the bundled app (Radix primitives and Lucide are compiled in, not CDN-loaded).

---

## 7. Backend and reliability improvements

| Area | Change |
|---|---|
| Module structure | Single `server.js` split into `src/{server,config,auth,validation,paths,audit,ws}.js`, `src/routes/{projects,files,execute}.js`, `src/services/{processManager,email}.js`; root `server.js` kept as a thin entry preserving `node server.js`. |
| Sessions | `express-session`, cookie `sm.sid` (httpOnly, SameSite=Lax, rolling 7-day), id regenerated on login (fixation defense). |
| Validation | zod schemas for every body + URL param; `.strict()` rejects unknown keys; `validateParams` for `:id` routes (params are not body). |
| CSRF | Origin/Host comparison on POST/PUT/PATCH/DELETE as defense-in-depth on top of SameSite=Lax. |
| Audit | Append-only JSONL (`audit.log`) for execute, file writes/uploads, project lifecycle. |
| Process mgmt | Win32 branches (`taskkill /T /F`, `getChildPids` → []) so the Windows dev environment works; POSIX keeps pgrep + SIGTERM→SIGKILL escalation. |
| Config | Atomic writes (temp + rename) at mode 0600; migration strips runtime-pollution keys (`status`/`stats`/`health`) from persisted projects; env overrides (`PORT`, `HOST`, `SESSION_SECRET`, `CONFIG_PATH`, `SMTP_*`). |
| Lifecycle | `main()` binds the port before auto-starting projects (B-5/B-6); SIGTERM/SIGINT stop all managed children before closing (B-7). |
| Email | Failures are logged and never block the exit handler. |
| Git update | `HOME` from `os.homedir()` (was hardcoded `/home/dilly`); shell metacharacters in paths blocked. |

---

## 8. Features preserved, fixed, added, or intentionally removed

**Preserved (feature-parity table from IMPLEMENTATION_PLAN.md):** project CRUD, start/stop/restart, restart-all, git update, auto-start on boot, crash counting + dismissible alerts + email notifications, live status/metrics over WS, live log stream with dedup, file browse/read/write/download/upload, command execution with history and save-as-project, dark/light theme, tag filter, metrics toggles. All are reachable in the React UI.

**Fixed:** B-1 restart-all ReferenceError; B-2 broken download (now implemented + tested); B-3 dead file context menu; B-5/B-6 auto-start ordering; B-7 graceful shutdown; S-1…S-6 (§3); hardcoded `/home/dilly`; old `toggleEmailAlerts` mass-assignment.

**Added:** `GET /api/session`; `POST /api/file/list`; `GET /api/audit` not added (log is file-only by design); `execute.timeoutMs`; config migration; 32-test suite; SPA + docs (`README`, `ARCHITECTURE`, `TESTING`, `SECURITY`, `CHANGELOG`); root scripts `npm run build`, `npm run dev:frontend`.

**Intentionally removed:** Bootstrap + bootstrap-icons + jsdelivr CDN; old `public/` UI; the ambiguous `POST /api/projects/update` (replaced by `POST /api/projects/:id/update`). No core user-facing feature was removed.

---

## 9. Tests executed and their actual results

Executed in this environment; all commands run against the working tree at commit `bebc8f5`.

| Command | Result |
|---|---|
| `npm test` (backend, Vitest) | **32 passed / 32**, 5 files (auth, projects, files, security, unit), ~19 s |
| `npm run build` (frontend, `tsc -b && vite build`) | **Success** — 0 TS errors; bundle `index-DqAzxTr4.js` 387.76 KB / **121.09 KB gzip**, CSS 24.73 KB / 5.33 KB gzip |
| Bootstrap reference grep (`src/`, `frontend/src`, manifests) | **Clean** — no matches |
| Live smoke test (spawned server on :5987, isolated config) | `/` → **200** (React HTML, `class="dark"`); `/api/projects` unauthenticated → **401**; `/files` SPA fallback → **200**; CSP header present with no CDN origins |
| `git diff 9ea7257..HEAD --stat` | 72 files changed, 10724 insertions, 4271 deletions — reviewed; no unintended changes (config.json correctly untracked) |

**Test suite coverage actually exercised:** T-AUTH-1/2, T-SEC-1 (401 sweep on all 15 routes), login rate-limit (429), fail-closed 503, T-PROJ-1/7/8/9/10/12/13/14, B-1 regression, S-6 regression, T-FM-2/4/5/6, T-CMD-4, execute timeout, T-LOG-8, T-SEC-2..8 (traversal, upload sanitization, CSRF origin, XSS-as-data, allowedRoots confinement), T-UNIT-1/2/3 (formatUptime, sanitizeUploadName, config migration).

**Not executed / not automated here (documented honestly):**
- **Playwright E2E and axe accessibility scans** were planned but not installed in this WSL/Windows environment (see §12). The frontend is verified by strict `tsc`, the production build, and the manual smoke test above; the §8 feature-parity table was validated by code review against the old UI's entry points rather than browser automation.
- **Email sending (SMTP)** is not exercised in tests (nodemailer transport is instantiated but no outbound mail is sent); the crash-email path is code-reviewed only.
- **Cross-device / mobile rendering** was not verified in a real mobile browser; responsive classes are present and were reviewed, not measured.
- **Performance under concurrent load** (many browsers streaming logs) was not load-tested; WS fan-out is a simple in-memory broadcast.

---

## 10. Accessibility, responsive-design, and performance checks

| Check | Evidence | Status |
|---|---|---|
| Keyboard accessibility | Radix Dialog/DropdownMenu/Switch primitives provide focus trap, Escape-to-close, arrow-key navigation, and ARIA roles by default | Implemented (via primitives) |
| Semantic HTML | `label`/`button`/`dialog` roles from shadcn-style components; form inputs all associated with `Label` | Reviewed in code |
| Color contrast / axe audit | Not run — Playwright + axe not installed in this environment | **Not verified** |
| Responsive layout | Tailwind responsive utilities (`sm:`, `md:`, `lg:`) in AppShell/Dashboard/FileManager; mobile FABs for primary actions | Reviewed, not device-tested |
| Dark/light theme | CSS variables switch via `data-theme`/class on `<html>`; persisted in localStorage under the old app's keys | Implemented + smoke-tested (`class="dark"` present) |
| Bundle size | 121.09 KB gzip JS + 5.33 KB gzip CSS (vs. old app + Bootstrap CDN which loaded ~230 KB+ of Bootstrap JS/CSS before app code) | Measured |
| WS reconnect | `connectWs` retries every 5 s with a predicate to avoid reconnect storms after intentional 401 | Implemented |

---

## 11. Configuration or API compatibility changes

**Breaking (with notice, per plan):**
1. **All API routes and WS upgrades now require a session** (D-1). Consumers must `POST /api/login` and send the `sm.sid` cookie. Unauthenticated requests receive 401 (503 if no password hash configured).
2. **`POST /api/projects/:id/update`** replaces the old ambiguous `POST /api/projects/update`.
3. **Request validation failures return 400** with a structured error; mass-assignment of runtime fields (`status`, `stats`, `health`, `id`) is rejected (S-6).
4. **Project `status`/`stats`/`health` are runtime-only** and no longer persisted to `config.json`; existing configs are migrated automatically on first load (keys stripped).
5. **`POST /api/file/list`** is the new endpoint; the old client-side `ls`-parsing approach is gone.

**Non-breaking additions:** `GET /api/session`; `execute.timeoutMs`; `security.allowedRoots` (empty default = unrestricted, D-2); `session.secret` (auto-generated if missing); env overrides (`PORT`, `HOST`, `SESSION_SECRET`, `CONFIG_PATH`, `SMTP_HOST/PORT/USER/PASS/FROM`); `npm run build` / `npm run dev:frontend` root scripts.

**Preserved as-is:** `config.json` shape (superset — new keys defaulted on load); port 5000 / host 0.0.0.0 defaults; cookie-based auth surface for browser clients; log buffer semantics (1000 lines/project).

---

## 12. Known limitations and outstanding risks

1. **No E2E/browser test automation** — Playwright and axe were not installed in the WSL/Windows environment used for this work. Feature parity and the security controls (auth, CSRF, containment, validation) are verified by the 32 backend tests and a live smoke test; UI behavior was verified by code review and the production build, not by driving a real browser.
2. **`allowedRoots` is empty by default (D-2)** — the app can still read/write/execute anywhere the Node process can, matching original behavior. Operators who expose it beyond a trusted LAN should configure roots and terminate TLS.
3. **Single privilege level** — one password, no RBAC, no per-user audit attribution beyond session/IP in the audit log.
4. **Rate limiting is per-IP in-memory** — resets on restart; no distributed store for multi-instance deployments.
5. **WS log streams are unpaginated** — bounded by the 1000-line ring buffer; no backfill/replay API.
6. **SMTP path is code-reviewed, not integration-tested** — no test sends real mail.
7. **Windows process management is best-effort** — `taskkill /T /F` tree-kill works for `node` children; POSIX (Raspberry Pi / Linux) remains the primary target.
8. **No HTTPS termination in-app** — expected to be fronted by a reverse proxy; `secure` cookie flag is auto-set behind HTTPS detection but the app itself speaks HTTP.

---

## 13. Deferred enhancements and recommended next steps

| Priority | Item |
|---|---|
| High | Install Playwright + axe-core; add E2E smoke (login → dashboard → start project → logs stream) and an accessibility scan of Login/Dashboard/FileManager. |
| High | Document + optionally default `security.allowedRoots` to a sensible home-directory confinement for new installs (currently unrestricted per D-2). |
| Medium | Frontend unit tests (Vitest + Testing Library) for `useProjects`, `api.ts` error mapping, and FileManager upload/overwrite flow. |
| Medium | Audit-log viewer (read-only `GET /api/audit` with pagination) so operators don't need shell access to inspect `audit.log`. |
| Medium | WS backfill/replay (send last N lines over a cursor) for log viewers that reconnect mid-stream. |
| Low | Per-command rate limit / allowlist option on `/api/execute` for shared-host deployments. |
| Low | Docker Compose + healthcheck for one-command deployment. |
| Low | Migrate `express-session` store from MemoryStore to a file/SQLite store for restart-survival of sessions. |

---

## 14. Traceability matrix

| Plan / Spec item | Implementation | Verification evidence |
|---|---|---|
| F0 scaffold | `frontend/` (Vite+React+TS+Tailwind+shadcn), commit `482e81c` | `npm run build` green |
| F1 dashboard + project cards | `DashboardPage.tsx`, `ProjectCard.tsx`, `useProjects.ts`, commit `5e23c69` | Build green; smoke `/` 200 |
| F2 logs + command modals | `LogsDialog.tsx`, `CommandDialog.tsx`, commit `5e23c69` | Build green |
| F3 file manager | `FileManagerPage.tsx`, commit `6777201` | Build green |
| F4 cut-over + delete Bootstrap | `server.js` static→dist, `public/` deleted, CSP cleaned, commit `a581b8b` | `npm test` 32/32; grep clean; smoke CSP header |
| D-1 enforce sessions everywhere | `auth.js` `requireAuth`; `ws.js` upgrade check | `T-SEC-1` 401 sweep (15 routes) |
| D-2 allowedRoots (default unrestricted) | `paths.js` `resolveContainment`; config default `[]` | `security.test.js` T-SEC-2/3 + confinement tests |
| D-3 shell gated + audited + timeout | `routes/execute.js`; `audit.js` | `files.test.js` execute + timeout tests |
| D-4 React+TS+Vite+Tailwind+shadcn | `frontend/` | `tsc -b && vite build` green |
| D-5 preserve routes/shapes | `src/routes/*` kept `/api/*` paths; auth+validation documented breaking-with-notice | Backend tests assert 401/400 semantics |
| S-1 unauthenticated API | `requireAuth` | `T-SEC-1` |
| S-2/S-3 path traversal + uploads | `paths.js`; `files.js` | `T-SEC-2/3/4` (traversal, upload sanitization) |
| S-5 XSS via innerHTML | React rewrite; no `dangerouslySetInnerHTML` | `security.test.js` XSS-as-data test; grep for `dangerouslySetInnerHTML` |
| S-6 mass assignment | `validation.js` `.strict()`; PUT allow-list | `projects.test.js` S-6 regression |
| B-1 restart-all ReferenceError | `routes/projects.js` scope fix | `projects.test.js` T-PROJ-13 |
| B-2 broken download | `files.js` `/api/file/download`; `api.ts` form download | `files.test.js` T-FM-4 |
| B-5/B-6 auto-start ordering | `server.js` `main()` listen-then-autostart | Code review; smoke test boots without racing |
| B-7 graceful shutdown | `server.js` SIGTERM/SIGINT handlers | Code review |
| T-UNIT-1 formatUptime | `unit.test.js` | 32/32 pass |
| T-UNIT-2 sanitizeUploadName | `unit.test.js` | 32/32 pass |
| T-UNIT-3 config migration | `unit.test.js` | 32/32 pass |
| Bootstrap fully removed | `public/` deleted; CSP cleaned; manifests grep-clean | `a581b8b`; §6 grep evidence |
| Docs (README/ARCH/TESTING/SECURITY/CHANGELOG) | Root `*.md` files, commit `bebc8f5` | Committed |
| `MODERNIZATION_REPORT.md` | This file | — |

**Commits (baseline → final):** `9ea7257` baseline → `04839a9` backend → `482e81c` F0 → `5e23c69` F1+F2 → `6777201` F3 → `a581b8b` F4 → `bebc8f5` docs.
