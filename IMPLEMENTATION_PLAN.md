# Implementation Plan — Server Manager Modernization

**Status:** Awaiting review before execution. See §14 for open decisions.
**Basis:** `SYSTEM_SPECIFICATION.md` (31-section audit) + direct source re-verification of every claim below (file:line cited).

---

## 1. Current Architecture Summary

| Layer | Implementation | Coupling notes |
|---|---|---|
| Runtime | Single Node.js process (`server.js`, 986 L), Express 4 + `ws` + `multer` + `nodemailer` + `bcrypt` | Everything in one file; no routes/ middleware / service separation |
| Persistence | One `config.json` (server/auth/email/projects), written in full on every change | No atomic write, no schema validation, runtime keys (`status`/`stats`/`health`) can leak in via PUT merge |
| Process mgmt | `child_process.spawn` with `shell:true`, in-memory `Map`s for processes/stats/logs/health; `ps`/`pgrep` shelled out for metrics | No supervision, no graceful shutdown, no crash-restart |
| Realtime | One `ws` server, two route shapes: `/status` (broadcast) and `/logs/:projectId` (per-project replay) | No auth on upgrade; log WS has no reconnect |
| Frontend | Vanilla JS, global mutable `AppState`, string-template HTML returned by `render*()` functions injected via `innerHTML`, inline `onclick` attributes, manual DOM patching for status updates | Bootstrap 5.3 + bootstrap-icons loaded from CDN; no build step, no bundler, no framework |
| Auth | `POST /api/login` bcrypt-compares and sets a boolean in browser memory; **no cookie, no session, no server-side enforcement** | Cosmetic UI gate only |
| Entry | `public/index.html` loads 9 scripts in a fixed order; `server.js` also serves `public/` statically at `/` | |

Frontend architecture in one sentence: **no framework — global state + string templates + innerHTML + inline event handlers**, with Bootstrap providing all layout, components, and icons.

---

## 2. Most Important Verified Findings

Confirmed by re-reading the current source (not just the spec):

### Security (P0)
| # | Finding | Evidence |
|---|---|---|
| S-1 | **Unauthenticated remote code execution** via `POST /api/execute` (arbitrary command, `shell:true`, any directory) | `server.js:809-863` |
| S-2 | **Unauthenticated arbitrary file read/write/download** — `..` substring check only; `/etc/passwd`, `/root/.ssh/id_rsa`, `config.json` itself all reachable | `server.js:649-701` (checked at runtime: `check('/etc/passwd') === 'ALLOWED'`) |
| S-3 | **Upload path traversal** — `path.join(directory, file.originalname)` resolves `../../../etc/cron.d/evil` → `/etc/cron.d/evil` (verified with `path.posix.join`) | `server.js:715` |
| S-4 | **Unauthenticated WebSocket** on `/status` and `/logs/:id` — any LAN client can watch all logs and control-flow state | `server.js:408-453` |
| S-5 | **Stored XSS** — `project.name`, `project.path`, `project.command`, `project.tags` rendered raw into `innerHTML` on every card; logs title and `showSuccessModal` also unescaped | `projectCard.js:34,51,54,60`; `handlemodals.js:90`; `handlefilemanager.js:490` |
| S-6 | **Mass-assignment / config pollution** — `PUT /api/projects/:id` merges whole `req.body`; frontend `toggleEmailAlerts` sends the entire project object including runtime `status`/`stats`/`health` | `server.js:551-570`; `handlemodals.js:613-617` |
| S-7 | **No CSRF protection, no rate limiting, no CSP, no security headers** | whole app |
| S-8 | **Secrets in plaintext** in `config.json` (SMTP password, bcrypt hash, emails) committed-adjacent to source; README claims a `.gitignore` that does not exist | `config.json`; `README.md:318` vs `ls` |

### Correctness (P1)
| # | Finding | Evidence |
|---|---|---|
| B-1 | **`restart-all` throws `ReferenceError` on any error path** — `runningProjects` is `const`-declared inside `try` but referenced in `catch` (reproduced: `THREW: ReferenceError - runningProjects is not defined`) | `server.js:488, 513` |
| B-2 | **`downloadCurrentFile()` / `downloadFile()` are undefined** — editor Download button and file-context Download action call missing functions; `POST /api/file/download` is an orphan endpoint | `handlefilemanager.js:216, 336`; `server.js:689-701` |
| B-3 | **`showFileContextMenu` is dead code** — defined but never invoked from the file list | `handlefilemanager.js:196`; `fileManagerDisplayFiles` only wires `viewFile`/`fileManagerNavigate` |
| B-4 | **Log WebSocket has no reconnect** — a single network blip silently freezes the log view until the modal is reopened (unlike `/status`, which retries) | `handlemodals.js:99-150` vs `api.js:71-77` |
| B-5 | **`server.listen` failure leaves a zombie** — `main()` auto-starts all projects *before* binding the port; if the port is taken, the process keeps running with children spawned but no UI | `server.js:972-986` |
| B-6 | **Startup blocks the port for up to ~37s** — DNS readiness poll (≤30s) + 5s stabilize + 2s×N auto-start delays all run before `server.listen` | `server.js:912-986` |
| B-7 | **No graceful shutdown** — no `SIGTERM`/`SIGINT` handler; managed children are orphaned when the manager dies | whole `server.js` |
| B-8 | **Config write is non-atomic and unvalidated** — direct `fs.writeFile` of the whole object; a crash mid-write corrupts it and bricks startup | `server.js:92-95` |

### UX / completeness (P2)
| # | Finding |
|---|---|
| U-1 | Hard-coded `/home/dilly` in 4 places (command modal, FM default dir, `execute`/git `HOME` fallback) — breaks on any other host |
| U-2 | FM terminal command history is a `TODO` stub; `updateCommandModalDirectories()` is an empty function |
| U-3 | Crash "history" is a single `alert()`; README promises a list |
| U-4 | Status is only `running`/`stopped`/`restarting` — no `starting`/`stopping`/`error` distinction despite UI states implying more |

---

## 3. Prioritized Security Remediation Plan

Ordered by exploitability × impact. Each item is independently shippable.

| Pri | Item | Approach |
|---|---|---|
| P0-1 | Server-side session auth on **every** HTTP route and WS upgrade | Signed, httpOnly, SameSite=Lax session cookie (`express-session` + memory store or signed JWT-in-cookie); `requireAuth` middleware mounted globally before routes; WS upgrade validates the session cookie from the upgrade request |
| P0-2 | Kill unauthenticated RCE surface | `/api/execute` becomes session-gated **and** constrained (see open decision D-3); FM terminal reuses the same gated endpoint |
| P0-3 | Path traversal + sandbox | Server-side `resolve` + allow-list of base directories (config `security.allowedRoots`, default `[]` = deny); reject symlinks pointing outside; use `fs.opendir`/`realpath` not string `includes('..')` |
| P0-4 | Upload filename sanitization | Strip path separators from `originalname`; resolve against target dir and verify containment; atomic `rename` with `EXDEV` fallback to copy+unlink |
| P0-5 | XSS elimination | Frontend rewrite renders via framework text nodes (auto-escaped); backend additionally HTML-encodes nothing but validates/normalizes project fields (length, charset) at write time |
| P0-6 | CSRF | SameSite=Lax cookie + `Origin`/`Referer` check middleware on state-changing verbs |
| P0-7 | Mass-assignment fix | `PUT`/`POST /api/projects` validate against an explicit field allow-list (`name, path, command, tags, autoRestart, emailOnCrash`); strip runtime keys |
| P0-8 | Rate limiting + lockout | `express-rate-limit` on `/api/login` (e.g. 5/15min per IP+session); generic error messages |
| P0-9 | Security headers | `helmet` (CSP, HSTS if TLS, X-Frame-Options, etc.) |
| P0-10 | Secret handling | Move secrets to env vars (`SMTP_PASS`, etc.) with `config.json` fallback; add `.gitignore` for `config.json`; stop returning whole config object anywhere |
| P1-1 | Audit logging | Append-only `audit.log` for start/stop/restart/delete/update/execute/file-write/ |
| P1-2 | Input validation everywhere | `zod` schemas for login, project CRUD, file ops, execute |
| P2-1 | Optional reverse-proxy / TLS docs | Document only; app stays HTTP behind proxy |

**Explicitly deferred pending product decision (D-2):** whether to restrict the filesystem/command surface to a sandbox root, or keep full absolute-path access as the app's intentional design.

---

## 4. Selected Frontend Library & Rationale

### Candidates evaluated

| Option | Verdict | Why |
|---|---|---|
| **React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (Radix primitives) + Lucide icons** | **SELECTED** | See below |
| Material UI (MUI) | Rejected | Material Design look fights the "dense, information-first dashboard" goal; heavier bundle; theming to a custom design system fights the library |
| Ant Design | Rejected | Enterprise/admin-kit aesthetic; large default bundle; less flexible theming for a compact ops tool |
| Mantine | Viable alternate | Good hooks + forms, but smaller ecosystem for data-dense custom layouts than Tailwind+shadcn; would still require React migration |
| Vue 3 + Naive/PrimeVue | Viable alternate | Comparable migration cost to React; team/agent familiarity and shadcn-style density favour React here |
| Framework-free (Pico.css / Open Props / Shoelace web components) | Rejected as primary | Lowest migration cost, but does not by itself deliver the *component API + design-token enforcement + accessibility guarantees* the task requires; we'd rebuild dialog/toast/combobox/menu semantics by hand — exactly the debt we're trying to exit |

### Why React + shadcn/ui for *this* app
1. **The existing architecture's root defects are structural, not cosmetic.** Global mutable state + string templates + inline `onclick` + `innerHTML` is the direct cause of stored XSS (S-5), duplicated action-button rendering in 3 places (`projectCard.js`, `updateActionButtons` in `api.js`, context menu), and the inability to unit-test components. A component model with a unidirectional data flow removes the XSS class by default and collapses the duplication.
2. **shadcn/ui (Radix) gives accessible primitives we currently lack** — focus-trapped dialogs, roving-focus menus/context menus, switches with proper ARIA, toast/announce regions — without locking us into a proprietary look. Tailwind enforces spacing/color tokens so "cohesive design system" is a config file, not a code-review burden.
3. **The migration is tractable**: 3 top-level views + ~7 modals, ~2,400 lines of frontend JS. Every existing behavior maps to a component; nothing in the backend changes *because* of the frontend choice.
4. **Build step is acceptable**: Vite dev server for development, `vite build` → static assets Express already serves from `public/` (or `dist/` wired into `express.static`). Deployment change is one `npm run build` added to the release procedure.

### The 8 required decision points
1. **Current limitations:** documented in §1 and §2 (no components, no escaping, no a11y, no state discipline, CDN Bootstrap with no version pinning strategy, no tests).
2. **Candidates evaluated:** table above.
3. **Pros/cons of viable options:** summarized above; full notes kept in this file's git history once the repo is initialized.
4. **Framework migration warranted?** **Yes** — migrating to React/TS. Justification: structural XSS/maintainability/testability defects, not fashion. The alternative (keeping vanilla JS) would require manually rebuilding accessible dialog/menu/toast/combobox semantics and still leave string-template XSS risk everywhere new markup is added.
5. **Selected library:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Lucide.
6. **Styling/theming/icons/forms/tables/dialogs/notifications:** Tailwind tokens (`--background`, `--foreground`, `--primary`, `--destructive`, `--muted`, semantic `--success`/`--warning`/`--danger` for status); shadcn `Dialog`, `DropdownMenu` (context menus), `Switch`, `Toast` (sonner), `Table`, `Input`/`Label`/`Field`; Lucide icons replace `bi-*`; forms via `react-hook-form` + `zod` resolver sharing schemas with the backend.
7. **Migration strategy & risks:** §6 below.
8. **Impact:** adds `node_modules` build artifact + `npm run build`; removes CDN dependency (better offline/CSP story); bundle ≈ 80–120 KB gzipped for this app size; accessibility moves from ~0 to WCAG 2.2 AA-targeted; maintenance shifts from "grep for inline handlers" to component props.

---

## 5. Framework Migration Decision

**Yes — migrate.** The cost of *not* migrating (rebuilding accessible primitives by hand, forever guarding against string-template XSS, untestable global state) exceeds the one-time cost of a React rewrite for an app of this size. The migration is scoped: no new backend endpoints are required purely for the frontend; the existing JSON API and WebSocket message shapes are consumed as-is (with auth added per §3).

---

## 6. Phased Bootstrap Replacement Strategy

Bootstrap is removed only in the final phase. During Phases F1–F4 the new React app is built *alongside* the existing `public/` files; Express serves the new build output once it reaches feature parity, then the old files are deleted.

| Phase | Scope | Bootstrap usage after phase | Verification |
|---|---|---|---|
| **F0** | Vite + React + TS + Tailwind + shadcn scaffold in `frontend/`; design tokens; app shell (sidebar/topbar, theme toggle, toast provider, session context); Login view | 100% (old app untouched) | `npm run build` succeeds; login screen renders; manual login against existing API |
| **F1** | Dashboard: project grid, card, status badge, metrics bars, crash banner, tag filter, context menu, Add/Edit/Delete/Restart-All modals | 100% (old app still default) | Feature-preservation checklist §7 rows 1–20 pass against the new build |
| **F2** | Logs modal (WS stream, dedup, autoscroll, timestamps, filter, export, clear) + Command modal (dir browser, quick-select, history, save-as-project) | 100% | Checklist rows 21–35 |
| **F3** | File Manager view (browser, breadcrumbs, upload DnD, editor/view modes, save, download — the previously broken download is *implemented*, not just migrated) + FM terminal | 100% | Checklist rows 36–50 |
| **F4** | **Switch Express `static` to the new build output; delete `public/js/*`, `public/styles.css`, old `index.html`; remove Bootstrap + bootstrap-icons from dependencies/CDN**; CSP updated to drop CDN origins | **0%** | `grep -r bootstrap` returns nothing; full regression suite + a11y + responsive checks |

Coexistence rule: at most one view is "half-migrated" at any commit; F1–F3 each end with the new view feature-complete and wired to the real API before the next starts. No commit leaves a user-visible broken path.

---

## 7. Feature-Preservation & Regression Checklist

Every row must pass before the corresponding phase is marked done. "Verified by" = automated test ID or manual procedure.

| # | Feature | Preserved in new UI? | Verified by |
|---|---|---|---|
| 1 | Login with password, error message on failure | | T-AUTH-1 |
| 2 | Logout clears state and disconnects WS | | T-AUTH-2 |
| 3 | Theme toggle (dark/light) persists | | T-UI-1 |
| 4 | Responsive navbar → hamburger on small screens | | T-UI-2 (manual) |
| 5 | Project grid, empty state | | T-PROJ-1 |
| 6 | Tag filter badges + clear | | T-PROJ-2 |
| 7 | Global metrics show/hide toggle | | T-PROJ-3 |
| 8 | Per-project metrics eye toggle | | T-PROJ-4 |
| 9 | Status badge + animated icon (running/stopped/restarting) | | T-PROJ-5 |
| 10 | CPU/memory bars + uptime text | | T-PROJ-6 |
| 11 | Start / Stop / Restart buttons per status | | T-PROJ-7/8/9 |
| 12 | Restart All with confirmation modal | | T-PROJ-10 (incl. B-1 regression) |
| 13 | Update (git pull) + result modal with output | | T-PROJ-11 |
| 14 | Add project modal (all fields incl. tags, auto-restart, email-on-crash) | | T-PROJ-12 |
| 15 | Edit project modal prefill | | T-PROJ-13 |
| 16 | Delete project with confirmation | | T-PROJ-14 |
| 17 | Right-click context menu on card | | T-PROJ-15 |
| 18 | Email-on-crash switch per card | | T-PROJ-16 |
| 19 | Crash banner with count/time/reason + dismiss + history | | T-PROJ-17 |
| 20 | Real-time status updates via `/status` WS (no full re-render) | | T-WS-1 |
| 21 | Logs modal opens, replays buffered logs | | T-LOG-1 |
| 22 | Live log stream via `/logs/:id` WS | | T-LOG-2 |
| 23 | Log dedup toggle (collapse repeats with xN) | | T-LOG-3 |
| 24 | Auto-scroll toggle | | T-LOG-4 |
| 25 | Timestamps toggle | | T-LOG-5 |
| 26 | Log text filter | | T-LOG-6 |
| 27 | Log export as `.txt` | | T-LOG-7 |
| 28 | Clear logs (server-side) | | T-LOG-8 |
| 29 | Log WS reconnect after drop (new — fixes B-4) | | T-LOG-9 |
| 30 | Command modal: directory input + breadcrumb + up + refresh | | T-CMD-1 |
| 31 | Command modal: directory contents list | | T-CMD-2 |
| 32 | Command modal: quick-select project directory | | T-CMD-3 |
| 33 | Command modal: execute, output rendering, clear-after-execute toggle | | T-CMD-4 |
| 34 | Command modal: ↑/↓ history | | T-CMD-5 |
| 35 | Command modal: Save as Project | | T-CMD-6 |
| 36 | FM: navigate by path / breadcrumb / up / refresh | | T-FM-1 |
| 37 | FM: file list with icons, sizes, dir-first sort | | T-FM-2 |
| 38 | FM: upload via drag-drop and file picker (with overwrite confirm) | | T-FM-3 |
| 39 | FM: view file (read-only) | | T-FM-4 |
| 40 | FM: edit mode toggle, save, unsaved-changes warning | | T-FM-5 |
| 41 | FM: download file (**implements B-2**) | | T-FM-6 |
| 42 | FM: file context menu (**wires B-3**) | | T-FM-7 |
| 43 | FM: terminal execute in current dir | | T-FM-8 |
| 44 | `POST /api/file/download` reachable from UI | | T-FM-6 |
| 45 | localStorage keys preserved (`theme`, `showMetrics`, `projectMetrics`, `clearCommandOnExecute`, `dismissedCrashes`) | | T-PREF-1 |
| 46 | `autoRestart` = boot-time auto-start (NOT crash-restart) semantics unchanged | | T-LIFE-1 |
| 47 | Crash = non-zero exit while not restarting; count + lastCrash tracked | | T-LIFE-2 |
| 48 | Config format backward-compatible (existing `config.json` loads) | | T-CFG-1 |
| 49 | Bootstrap fully removed from prod deps and code | | grep check |
| 50 | Session required for every route (new enforcement) | | T-SEC-1..N |

---

## 8. Backend & Frontend Architectural Changes

### Backend (incremental, no big-bang rewrite)
- Split `server.js` into `src/server.js` (bootstrap), `src/config.js` (load/validate/save + atomic write), `src/auth.js` (session middleware), `src/routes/projects.js`, `src/routes/files.js`, `src/routes/execute.js`, `src/services/processManager.js`, `src/services/logStore.js`, `src/services/statsSampler.js`, `src/ws.js`.
- Add `requireAuth` middleware; validate session on WS upgrade.
- Centralized `zod` validation + uniform error envelope `{ success:false, error, code }`.
- `restart-all` bug fix (B-1): declare `runningProjects` outside `try` or recompute in `catch`.
- Implement `downloadCurrentFile` client → wire to `POST /api/file/download` (GET would be more idiomatic but preserves the documented POST contract).
- Atomic config writes (`write temp + rename`), schema validation on load, migration hook for legacy keys.
- Graceful shutdown: on `SIGTERM`/`SIGINT`, stop all children, close WS, flush, exit.
- Listen-before-autostart reorder (fixes B-5/B-6): bind port first, then run auto-start asynchronously.
- Log WS reconnect logic mirroring `/status`.
- Replace `/home/dilly` hard-coding with `os.homedir()` / config `server.defaultDir`.

### Frontend
- `frontend/` Vite app: `src/main.tsx`, `src/App.tsx`, `src/lib/api.ts` (typed fetch wrapper + WS manager), `src/state/` (Zustand or React Context for session/projects/prefs), `src/components/ui/*` (shadcn), `src/features/{auth,dashboard,logs,command,filemanager}/*`.
- Design tokens in `tailwind.config` + `globals.css`; dark/light via `data-theme` attribute + CSS variables (replaces Bootstrap `data-bs-theme`).
- All inline `onclick` → React event handlers; all interpolations → text nodes (framework escaping).

---

## 9. Dependencies

### Add
| Package | Where | Why |
|---|---|---|
| `react`, `react-dom` | frontend | UI framework |
| `typescript`, `vite`, `@vitejs/plugin-react` | frontend dev | Build |
| `tailwindcss`, `postcss`, `autoprefixer` | frontend dev | Styling |
| `shadcn`/`@radix-ui/react-*`, `class-variance-authority`, `clsx`, `tailwind-merge` | frontend | Components |
| `lucide-react` | frontend | Icons |
| `zod` | shared | Validation |
| `react-hook-form`, `@hookform/resolvers` | frontend | Forms |
| `sonner` or shadcn `Toast` | frontend | Notifications |
| `express-session` (or `cookie-session`) | backend | Real sessions |
| `helmet` | backend | Security headers |
| `express-rate-limit` | backend | Login lockout |
| `csurf`-equivalent (custom Origin check or `csrf-csrf`) | backend | CSRF |
| `vitest`, `@testing-library/react`, `supertest`, `playwright` | dev | Tests (§11) |

### Remove
| Package | When |
|---|---|
| Bootstrap CDN + bootstrap-icons CDN links | F4 |
| (no npm Bootstrap dependency exists today — it's CDN-only, so "removal" = deleting the `<link>` tags and all `btn-`/`bi-`/`card`/`modal` class usage) | F4 |
| `nodemon` stays as devDependency | — |

### Keep unchanged
`express`, `ws`, `multer`, `bcrypt`, `nodemailer` (versions may be bumped within semver for audit fixes).

---

## 10. Configuration & Data Migration

- `config.json` remains the source of truth. New optional keys (defaults preserve current behavior):
  - `security.allowedRoots: string[]` (default `[]` → current absolute-path behavior, pending D-2)
  - `server.defaultDir: string` (default `os.homedir()`)
  - `session.secret` (or env `SESSION_SECRET`) — auto-generated and persisted on first run if absent
- Migration on load: detect polluted `status`/`stats`/`health` keys on project objects and strip them (write-back cleaned config once).
- Email credentials: read `SMTP_USER`/`SMTP_PASS` env first, fall back to `config.email.*`.
- No destructive migration; `config.example.json` updated to document new keys.

---

## 11. Testing & CI Improvements

- **Unit (Vitest):** `formatUptime`, `parseFileList`, `killProcessTree` pid enumeration, path-containment validator, config load/validate/migrate, crash-detection state machine.
- **API (Supertest + vitest):** auth gate (every route 401 without session), login rate-limit, project CRUD validation, mass-assignment rejection, file read/write/upload/download containment, execute gating, restart-all error path (regression for B-1).
- **Security regression:** path traversal corpus (`../`, absolute, symlink, encoded), stored-XSS payload in project name → assert not reflected as HTML, CSRF origin rejection.
- **Frontend component (Testing Library):** login form, project card status mapping, log dedup logic, file-list parsing, context menu keyboard nav.
- **E2E (Playwright, headless Chromium):** login → dashboard → start/stop a **fixture** project (a long-running `node -e "setInterval(...)"` in a temp dir) → view logs → edit/download a temp file → logout. All against an isolated config/port, never the real `config.json` or real services.
- **Build/production startup:** `npm run build && npm start` smoke test asserts port binds and `/` returns 200 with no `bootstrap` string in HTML.
- **CI:** GitHub Actions on push/PR — install, lint (eslint + prettier), typecheck, unit+API tests, build, Playwright. (Requires initializing git; repo currently has none.)
- **Accessibility:** `@axe-core/playwright` scan on each view; contrast + keyboard-nav checklist.
- All destructive/real-service operations are forbidden in tests; fixtures use throwaway dirs under `os.tmpdir()`.

---

## 12. Documentation Updates

| File | Action |
|---|---|
| `README.md` | Rewrite: real setup, build (`npm run build`), security model, removal of false `.gitignore` claim, env vars |
| `ARCHITECTURE.md` | New: backend module map, frontend component tree, design tokens, data flow, WS protocol |
| `TESTING.md` | New: commands, fixtures, how to run e2e locally |
| `SECURITY.md` | New: auth model, threat model, allowed-roots decision, reporting |
| `CHANGELOG.md` | New: breaking changes (auth required, API field validation), fixes (B-1..B-8), features |
| `IMPLEMENTATION_PLAN.md` | This file; updated per phase with progress + deviations |
| `MODERNIZATION_REPORT.md` | Final Phase 13 deliverable |

---

## 13. Risks, Dependencies, Rollback, Acceptance Criteria

| Risk | Mitigation | Rollback |
|---|---|---|
| Auth breaks existing scripts/monitoring that hit the API unauthenticated | Document breaking change; provide `SESSION_SECRET` + a documented cookie-acquisition flow; keep a short-lived "migration" flag only if user requests it | Feature-flag `security.enforceAuth` default `true`; can be set `false` for LAN-only deployments |
| Frontend rewrite introduces regressions | Checklist §7 gates every phase; old `public/` retained until F4 | F4 is the only destructive cutover; before it, revert single commit restores old UI |
| Session store loss on restart (memory store) | Acceptable for single-process app; users just re-login. Document. | Swap to `connect-sqlite3` later without API change |
| `ps`/`pgrep` parsing differs across distros | Isolate in `statsSampler` with fixture-based tests for multiple `ps` outputs | Graceful degradation to zero metrics already exists |
| No git repo → no diff review / CI | Initialize git as Phase 0, commit baseline before any change | Every phase = one or more commits; `git revert` |

**Acceptance criteria (must all be true to declare done):**
1. All 50 checklist rows in §7 pass (automated where possible).
2. `grep -ri bootstrap` over source and `package-lock.json` returns no production hits.
3. Every HTTP route and WS upgrade rejects unauthenticated requests (verified by Supertest + Playwright, independent of UI).
4. Path-containment test corpus passes; `/api/execute` gated.
5. `npm run build && npm start` boots, binds, serves the new UI, and `config.json` is byte-identical (no test writes).
6. No secrets in logs, API responses, or the built frontend bundle.
7. Axe scan: 0 critical/serious violations on Login, Dashboard, Logs, FileManager.
8. `MODERNIZATION_REPORT.md` exists with honest completed/partial/planned/unverified labeling.

---

## 14. Open Product Decisions (require your input before Phase 10)

These materially change implementation and cannot be safely inferred from the repository. **Nothing below has been implemented yet.**

### D-1 — Authentication enforcement model
The current login is cosmetic. Making it real is a **breaking change** for any external script/monitoring hitting the API.
- **Option A (recommended):** Enforce sessions on all HTTP routes + WS by default. Breaking for unauthenticated API consumers; correct security posture.
- **Option B:** Enforce by default but allow `security.enforceAuth: false` in config for explicitly-LAN-only deployments, documented as insecure.
- **Option C:** Keep auth cosmetic (not recommended; contradicts task Phase 5).

### D-2 — Filesystem & command execution access model
The task explicitly forbids silently imposing a sandbox. Current behavior: **full absolute-path read/write/execute anywhere the service user can reach.**
- **Option A (recommended):** Preserve full absolute-path capability but require authentication; add an *optional* `security.allowedRoots` allow-list for operators who want confinement (empty = unrestricted, matching today).
- **Option B:** Default-deny with a required `allowedRoots` list; breaks existing workflows until configured.
- **Option C:** Hard sandbox to a single configured root (most secure, most breaking).

### D-3 — Command execution surface
- **Option A (recommended):** Keep arbitrary command execution (it's the product's point) but session-gated + audited + timeout-limited; no allowlist.
- **Option B:** Add a configurable denylist (e.g. `rm -rf /`, `mkfs`, `dd`) — security theater unless comprehensive; maintenance burden.
- **Option C:** Replace free-form shell with a curated action set (start/stop/git/file-ops only) — largest UX change.

### D-4 — Frontend framework migration
- **Option A (recommended):** React + TypeScript + Vite + Tailwind + shadcn/ui per §4–§6.
- **Option B:** Framework-free modernization (keep vanilla JS, swap Bootstrap CSS for Tailwind/Pico, keep global-state architecture) — faster, cheaper, but leaves the structural XSS/testability debt in place.

### D-5 — API compatibility posture
- **Option A (recommended):** Preserve existing routes/shapes; add auth + validation as additive/breaking-with-notice; document in CHANGELOG.
- **Option B:** Freeze API, version it (`/api/v2`) — more work than this app warrants.

---

**Awaiting your decisions on D-1 through D-5 (or explicit "use recommended defaults") before any code is written.**
