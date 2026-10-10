# Server Manager — Comprehensive Audit, Modernization, Security Hardening, and Feature Expansion

## Role and Objective

Act as a senior software architect, security engineer, and full-stack developer. Your task is to reverse-engineer, document, modernize, and improve this existing server management application.

This application was originally built with AI assistance and includes functionality for starting and stopping services, viewing logs, managing files, executing commands, and monitoring server processes.

I have provided `SYSTEM_SPECIFICATION.md`, a detailed analysis of the existing project. Treat it as the starting point for your investigation, not as an unquestionable source of truth. Verify its claims against the current source code and configuration.

The long-term objective is to transform the existing application into a secure, maintainable, reliable, and modern server management platform while preserving useful functionality and improving its architecture, user experience, and capabilities.

**A major objective is to replace the existing Bootstrap-based frontend with a modern UI component library and a cohesive design system.** Do not merely update Bootstrap colors, spacing, or themes. Evaluate appropriate alternatives and implement a deliberate frontend modernization.

Work methodically. Understand the existing system before making changes, document your implementation plan, identify significant risks, and implement improvements incrementally.

---

## Phase 1: Inspect the Existing Project

Before modifying anything, thoroughly inspect the project, including:

- `SYSTEM_SPECIFICATION.md`
- Frontend source code, stylesheets, HTML, JavaScript, and existing Bootstrap usage
- Backend routes, middleware, services, and process-management logic
- Authentication and authorization mechanisms
- WebSocket connections and event handling
- Filesystem and command-execution functionality
- Configuration files, environment variables, and persistence mechanisms
- Dependency manifests and lockfiles
- Existing documentation, scripts, tests, and deployment configuration
- Git history, where available and relevant

Do not assume that the specification perfectly reflects the current implementation. Identify discrepancies and use the source code as the primary evidence of actual behavior.

Determine the existing frontend architecture, including whether the application uses a framework, plain JavaScript, template strings, manual DOM updates, global state, or a combination of approaches.

Inspect how Bootstrap is currently used. Identify its CSS and JavaScript dependencies, layout conventions, components, icons, utility classes, theme overrides, and any custom components built around it.

Establish which parts of the application are tightly coupled to the current UI implementation.

Do not begin substantial implementation until you understand the application's architecture and its existing behavior.

## Phase 2: Establish a Functional Baseline

Create an inventory of the current application before redesigning it.

Document:

- Every page, view, modal, navigation element, and major interface component
- Every user action and the corresponding backend operation
- Every existing feature and its dependencies
- All API endpoints and WebSocket events
- Authentication, authorization, session, and configuration behavior
- Error handling, validation, loading states, and notifications
- Responsive behavior and accessibility characteristics
- Current visual conventions and inconsistencies
- Known defects, security vulnerabilities, and incomplete features

Create a feature-preservation checklist that can be used to verify the application after modernization.

Distinguish between behavior confirmed by source inspection, behavior confirmed by tests, and behavior that still requires runtime verification.

Do not remove functionality simply because it is difficult to migrate or is not immediately visible in the interface.

## Phase 3: Modern Frontend Architecture and UI Library Selection

The existing project uses Bootstrap. Evaluate whether to replace it with a modern component library and, if appropriate, select and implement a replacement.

Do not assume a particular library is automatically the best choice. Investigate the current project architecture, existing dependencies, maintenance requirements, and development goals before deciding.

### Evaluate suitable options

Consider appropriate options such as:

- **Tailwind CSS with shadcn/ui** — utility-first styling and customizable, composable components, particularly suitable if adopting React.
- **Material UI (MUI)** — a comprehensive React component library with established interaction patterns and theming.
- **Ant Design** — a comprehensive component system with extensive data-oriented and administrative interface components.
- **Mantine** — a React component library with integrated hooks, form utilities, and customizable components.
- **Vue-based alternatives**, if the existing architecture or a justified framework migration favors Vue.
- **A modern, framework-independent component library**, if retaining the existing plain JavaScript architecture is the better choice.

These are candidates to investigate, not mandatory dependencies. Verify current compatibility, maintenance status, licensing, dependency requirements, accessibility support, and integration costs before choosing.

### Make an explicit architectural decision

Before implementation, document:

1. The current frontend architecture and its limitations.
2. The candidate libraries evaluated.
3. The advantages and disadvantages of each viable option for this application.
4. Whether to retain the current frontend framework or migrate to a framework such as React.
5. The selected component library and the concrete reasons for choosing it.
6. The proposed styling, theming, icon, form, table, dialog, and notification systems.
7. The migration strategy and the risks associated with it.
8. The expected impact on build tooling, dependencies, performance, accessibility, and maintenance.

Do not migrate to a new frontend framework solely because it is fashionable. A framework migration must have a clear architectural justification and a manageable implementation plan.

If adopting a React-based library requires migrating the current plain JavaScript frontend, include that work explicitly in the implementation plan rather than treating it as a small styling change.

Avoid mixing Bootstrap and the replacement design system indefinitely. Temporary coexistence may be justified during migration, but it must have a defined scope and removal plan.

### Establish a cohesive design system

The redesigned application should have consistent standards for:

- Typography and text hierarchy
- Color palettes and semantic status colors
- Spacing and layout
- Page structure and navigation
- Buttons and interactive controls
- Forms, validation, and error messages
- Tables and data-dense views
- Dialogs, drawers, and confirmation prompts
- Toast notifications and persistent alerts
- Loading, empty, error, and success states
- Icons and visual indicators
- Responsive layouts
- Keyboard navigation and accessibility

Use the selected library's intended component and theming APIs rather than building unnecessary custom replacements for components it already provides.

Create reusable application-level components where they provide genuine value. Avoid both duplicated interface logic and excessive abstraction.

## Phase 4: Frontend Redesign Requirements

Redesign the existing interface into a polished, professional server management dashboard.

The visual direction should prioritize clarity, information density, consistency, responsiveness, and usability over decorative effects.

Evaluate the following areas and adapt them to the existing feature set.

### Application shell and navigation

- A clear, consistent application layout
- Intuitive navigation between services, logs, monitoring, files, settings, and other existing features
- A clear distinction between global application actions and page-specific actions
- Appropriate responsive behavior for smaller screens
- Consistent page titles, breadcrumbs where useful, and contextual actions

### Service and project management

- Clear service names and status indicators
- Readable CPU, memory, uptime, and other available metrics
- Distinct running, stopped, starting, stopping, and error states where supported
- Clear start, stop, restart, and bulk-action controls
- Confirmation prompts for consequential operations
- Feedback showing whether an action succeeded or failed
- Search, filtering, sorting, and grouping when useful and supported by the data

Do not invent status information or display metrics the backend does not provide.

### Logs and monitoring

- Readable log output with appropriate typography and spacing
- Clear separation between timestamps, severity, sources, and messages where available
- Usable filtering and search
- Appropriate handling of long lines and large log streams
- Clear loading, connection-loss, and empty states
- Efficient rendering for streaming updates and large amounts of data

Preserve useful live-log behavior and WebSocket functionality.

### Filesystem management and command execution

- Clear file and directory navigation
- Readable file metadata and permission information where available
- Usable editing and command-entry interfaces
- Explicit warnings and confirmations for destructive actions
- Clear operation results and actionable error messages
- Appropriate loading indicators and protection against accidental duplicate submissions

The interface must not expose capabilities beyond those authorized by the backend.

### Forms, dialogs, and notifications

- Consistent form layouts and validation
- Clear labels and accessible descriptions
- Unsaved-change warnings where appropriate
- Confirmation dialogs for destructive or consequential operations
- Notifications that communicate success, failure, and relevant details
- Avoidance of unnecessary alerts or interruptive modal dialogs

### Accessibility and responsive design

Target WCAG 2.2 AA where practical. Include:

- Keyboard-operable controls and navigation
- Visible focus indicators
- Accessible labels and descriptions
- Appropriate contrast
- Semantic markup and accessible component patterns
- Screen-reader-compatible status announcements
- Usable layouts at desktop, tablet, and mobile widths

Do not rely on color alone to communicate status.

Test the redesigned application at multiple viewport sizes and with keyboard navigation.

## Phase 5: Security Audit and Hardening

Treat security as a critical requirement, not a cosmetic improvement.

Investigate and address the issues identified in `SYSTEM_SPECIFICATION.md`, verifying each against the current code.

Prioritize:

1. Server-side authentication enforcement.
2. Authorization checks for every protected API operation.
3. WebSocket authentication and authorization.
4. Command-execution security, including injection risks and execution boundaries.
5. Filesystem path traversal and access-control vulnerabilities.
6. Session management, cookie settings, and credential handling.
7. Input validation and safe error handling.
8. Cross-site scripting and unsafe rendering.
9. Cross-site request forgery protections where applicable.
10. Dependency vulnerabilities and unsafe configuration defaults.
11. Secret exposure through logs, API responses, or frontend bundles.
12. Secure handling of destructive operations.

A frontend login screen is not a security boundary. Do not consider a route secure merely because the UI hides its controls.

Do not treat a redesigned UI, disabled button, hidden menu, or client-side validation as a replacement for backend enforcement.

Pay particular attention to file editing, deletion, uploads, downloads, command execution, and other operations with significant impact.

Document security assumptions and any unresolved high-risk issues.

Do not silently impose a restricted filesystem root if the existing application intentionally supports absolute paths. Determine the intended access model, document the trade-offs, and ask for clarification if the correct behavior cannot be inferred safely.

Never expose real credentials, tokens, passwords, or sensitive configuration values in documentation, logs, screenshots, or generated reports.

## Phase 6: Backend Architecture and Reliability

Review the existing backend and identify improvements that are justified by concrete problems.

Consider:

- Separation of routes, business logic, and infrastructure
- Centralized validation and error handling
- Consistent API responses
- Safe asynchronous process management
- Reliable service lifecycle operations
- WebSocket lifecycle and reconnection behavior
- Configuration validation and migration
- Logging and operational diagnostics
- Resource cleanup and graceful shutdown
- Appropriate concurrency handling
- Clear separation between UI state and backend state

Preserve existing API contracts when practical. If a contract must change, document the reason, migration path, and compatibility implications.

Do not undertake an unnecessary rewrite of working backend functionality solely to make the code look more modern.

## Phase 7: Bug Fixes and Feature Preservation

Use the baseline inventory and `SYSTEM_SPECIFICATION.md` to investigate existing defects.

Verify and address relevant issues, including any identified problems with:

- Missing or incomplete file-download handlers
- Restart All error handling
- Filesystem access and path validation
- Inconsistent error feedback
- Terminal or command execution behavior
- Incorrect service lifecycle handling
- Startup behavior and the meaning of `autoRestart`
- Incomplete or misleading UI states

Do not assume these defects still exist without inspecting the current code.

Preserve the distinction between startup auto-start and restart-on-crash unless the product requirements explicitly change.

Do not remove existing capabilities during frontend migration. If a capability is unsafe, replace it with a secure equivalent or document why it must be disabled.

## Phase 8: Testing Strategy

Establish a testing strategy before major implementation work.

The project currently appears to lack a comprehensive test suite and CI pipeline. Verify this and establish an appropriate baseline.

Add tests appropriate to the existing and proposed architecture:

- Unit tests for core backend logic
- API tests for authentication, authorization, validation, and errors
- Security regression tests for critical vulnerabilities
- Frontend component tests for important interactions
- Integration tests for frontend-to-backend workflows
- End-to-end tests for essential user journeys
- Responsive and accessibility checks where practical
- Build and production-startup verification

At minimum, test critical workflows for:

- Logging in and accessing protected functionality
- Viewing and managing services
- Starting, stopping, and restarting services
- Viewing live logs
- Viewing metrics
- Navigating and managing files
- Editing and downloading files where supported
- Executing authorized commands
- Handling API and WebSocket failures
- Saving and loading configuration
- Using the redesigned interface without Bootstrap

Use mocks, disposable fixtures, or isolated test environments when operations could affect real services or files.

Do not run destructive commands against real managed services or overwrite existing user configuration as part of testing.

## Phase 9: Implementation Plan Before Code Changes

Before making substantial changes, create a root-level file named `IMPLEMENTATION_PLAN.md`.

It must include:

1. A summary of the current architecture.
2. The most important verified findings from `SYSTEM_SPECIFICATION.md` and source inspection.
3. A prioritized security remediation plan.
4. The chosen frontend library and the rationale for the selection.
5. Whether a framework migration is warranted.
6. A phased Bootstrap replacement strategy.
7. A feature-preservation and regression-testing checklist.
8. Backend and frontend architectural changes.
9. Dependencies to add, remove, or replace.
10. Configuration and data migration considerations.
11. Testing and CI improvements.
12. Documentation updates.
13. Risks, dependencies, rollback options, and acceptance criteria.
14. Any unresolved product decisions that materially affect implementation.

For the frontend migration, include a concrete mapping from the current Bootstrap-dependent components to their intended replacements. Identify which pages or components will migrate in each phase, how functionality will be verified, and when Bootstrap can be removed.

Separate essential security fixes from architectural improvements, UI modernization, optional features, and long-term ideas.

Do not modify production data, real service configurations, or user credentials.

After creating the plan, summarize the key decisions and uncertainties for review. If a material product decision cannot be safely inferred from the repository, ask a focused clarification question before committing to that behavior. Otherwise, proceed using documented assumptions and conservative defaults.

## Phase 10: Execute the Plan Incrementally

Once the plan is established, implement it in small, verifiable phases.

Suggested ordering:

1. Establish a working baseline and protect existing configuration.
2. Fix critical security vulnerabilities and add regression tests.
3. Improve backend correctness and error handling.
4. Establish frontend build tooling and the chosen UI library, if required.
5. Build the new application shell and shared design system.
6. Migrate existing pages and components incrementally.
7. Replace Bootstrap-specific styling, JavaScript plugins, and dependencies.
8. Improve frontend state management and API integration where justified.
9. Fix remaining functional defects.
10. Implement approved enhancements.
11. Run regression, security, accessibility, responsive, and production-build checks.
12. Update documentation and remove obsolete dependencies.

Adapt the sequence if dependencies or security concerns require a different order. Document any significant deviations from the plan.

For each phase:

- State the intended outcome.
- Make focused changes.
- Run the relevant tests and checks.
- Inspect the resulting diff.
- Resolve regressions before proceeding.
- Update the implementation plan and progress notes.
- Avoid unrelated refactoring that increases risk without clear benefit.

Do not leave the application in a state where some pages use the new design system and others are unintentionally broken or inconsistent. Temporary migration states must be documented and testable.

## Phase 11: Additional Feature Evaluation

After the core application is secure, reliable, and modernized, evaluate potential enhancements.

Possible areas include:

- Improved service health monitoring
- More useful resource and historical metrics
- Configurable notifications
- Better log search and filtering
- Service dependency management
- Operation history and audit logs
- Safer bulk operations
- Improved configuration management
- Backup and restore workflows
- More useful dashboard customization
- Improved administrative workflows

These are suggestions to evaluate, not requirements to implement automatically.

For each proposed enhancement, explain the user benefit, implementation cost, security implications, dependencies, and relationship to existing features. Prioritize based on actual needs and the application's scope.

Do not introduce a feature that expands the application's attack surface without a corresponding security design.

## Phase 12: Documentation

Create or update the following root-level documentation as appropriate:

- `README.md` — setup, configuration, operation, and usage.
- `ARCHITECTURE.md` — backend, frontend, component library, design system, data flow, and key architectural decisions.
- `TESTING.md` — test commands, fixtures, test environments, and verification procedures.
- `SECURITY.md` — authentication, authorization, threat considerations, security limitations, and reporting guidance.
- `CHANGELOG.md` — user-visible changes, fixes, and breaking changes.
- `IMPLEMENTATION_PLAN.md` — implementation phases, progress, decisions, and outstanding items.

Document the selected UI library, installation and build commands, theme customization, component conventions, and guidelines for developing new pages so that future changes remain visually consistent.

Update existing documentation instead of creating unnecessary duplicate documents.

## Phase 13: Final Verification and Report

Before declaring the work complete:

- Run the available test suite.
- Run frontend and backend build or validation commands.
- Confirm that all existing core features remain accessible and functional.
- Verify that Bootstrap has been removed from production dependencies and application code, unless a documented technical constraint prevents complete removal.
- Verify that the new design system is applied consistently.
- Test critical security controls independently of the UI.
- Review the final Git diff for unintended changes.
- Confirm that real configuration and user data were preserved.
- Document all checks that could not be performed.

Produce a root-level `MODERNIZATION_REPORT.md` containing:

1. Executive summary.
2. Original architecture and verified baseline.
3. Security issues identified and their remediation status.
4. Chosen frontend library and reasons for selection.
5. Frontend architecture and design-system changes.
6. Bootstrap migration status and any remaining dependencies.
7. Backend and reliability improvements.
8. Features preserved, fixed, added, or intentionally removed.
9. Tests executed and their actual results.
10. Accessibility, responsive-design, and performance checks.
11. Configuration or API compatibility changes.
12. Known limitations and outstanding risks.
13. Deferred enhancements and recommended next steps.
14. A traceability matrix mapping the original specification and implementation plan to changes and verification evidence.

Distinguish completed work from partial work, planned work, and unverified behavior. Never claim a test passed unless it was actually executed and its result was observed.

## Operating Principles

Throughout the task:

- Inspect before changing.
- Use evidence instead of assumptions.
- Prioritize security and data integrity.
- Preserve useful functionality.
- Prefer maintainable solutions over unnecessary complexity.
- Keep frontend and backend responsibilities clearly separated.
- Follow the selected UI library's conventions.
- Avoid gratuitous dependency additions.
- Do not hardcode credentials or expose secrets.
- Do not overwrite real configuration with test data.
- Do not execute destructive operations against real services or files.
- Do not conceal unresolved problems.
- Ask clarifying questions when a consequential product decision cannot be inferred confidently.
- Keep the documentation aligned with the actual implementation.

The end goal is not merely a redesigned dashboard. It is a secure, maintainable server management application with a coherent modern frontend, reliable backend behavior, preserved functionality, meaningful automated tests, and documentation that allows a future developer or AI agent to understand and continue the project confidently.