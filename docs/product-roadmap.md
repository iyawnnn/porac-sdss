# Product Roadmap

**Purpose.** This file is the priority source of truth for *what to build next* in Porac SDSS. Read it before proposing or starting a feature. `PLAN.md` stays the architecture/decision record (why things are built the way they are); this file only answers "what's next, what's deferred, what must not be built yet."

Porac SDSS is a real operational system for MEO/MDRRMO, not an MVP prototype to be discarded once a demo is over — treat every item below as a production feature with production stakes (RBAC, audit trail, data integrity), not a proof of concept.

**Maintenance rule.** Update this file in the same change whenever a planned feature is completed, skipped, or reprioritized. A roadmap that lags the code is worse than none — the next session will trust it.

---

## 1. Completed Foundation

Verified against the current tree, not assumed:

**Citizen side** — `app/(citizen)/`
- Report submission with photo/EXIF, server-computed elevation, barangay resolution (`report/`)
- Report list and per-report tracking timeline (`reports/`, `dashboard/reports/[id]/`)
- Public map (`map/`), account page, signup/login, forgot/reset password

**Admin side** — `app/admin/`
- Operations dashboard with range control, distributions, barangay/category rankings, and role-aware Quick Actions (`page.tsx`, `components/features/admin/dashboard/`)
- Ticket Queue with URL-query filters — `?status=`, `?urgency=`, `?barangayId=` are real `TicketsService.parseTicketQuery` filters (`tickets/`)
- Ticket Detail: reports, status tracker, assignment/reassignment panel, urgency decomposition, priority breakdown, resolution photo + notes (`tickets/[id]/`)
- Interactive map with category/urgency/barangay/status filters and heatmap layer (`map/`)
- Flagged Reports moderation queue — dismiss / quarantine / duplicate (`flagged/`)
- System Admin Management, Admin Activity Log, admin password management, account activation/deactivation (`admins/`, `activity-log/`, `account/`)

**Platform**
- Notifications (`api/src/notifications/`, `NotificationBell`)
- RBAC + office scoping: `isSystemAdmin` / `resolveOfficeScope` / `assertOfficeAccess` in `api/src/common/authz/admin-scope.ts`, plus `AdminSessionGuard` / `SystemAdminGuard`
- Deduplication, urgency triage, weather/DEM pipeline (see `PLAN.md` §6–§7)
- `docs/database.md` per-table reference and the `city_boundary_osm` import

Existing admin routes are exactly: `/admin`, `/admin/tickets`, `/admin/tickets/[id]`, `/admin/map`, `/admin/flagged`, `/admin/admins`, `/admin/activity-log`, `/admin/account`, `/admin/login`, `/admin/work-orders`.

---

## 2. Recently Completed Operational Features

### Office Work Orders / Office Tasks — **completed**

The first genuinely operational feature: admins can now record and track the actual field work MEO/MDRRMO does to resolve a ticket, not just triage and status-change the ticket itself.

`work_orders` table (`api/src/db/schema.ts`, `api/drizzle/0021_work_orders.sql`, run via `pnpm --prefix api migrate:work-orders`) — linked ticket, title, internal `notes`, `assigned_office` (inherited from the ticket at creation time), optional `assigned_admin_id`, its own `pending`/`in_progress`/`completed`/`cancelled` status (independent of `ticket_status` — no coupling exists, a deliberate design decision, not a gap), nullable `due_date`, and created/updated/completed timestamps.

- `WorkOrdersController`/`WorkOrdersService` (`api/src/admin/work-orders.*`) expose list/get/create/update/status endpoints, all behind `AdminSessionGuard`. List uses `resolveOfficeScope` (silent clamp); single-resource reads/writes use `assertOfficeAccess` (hard reject) against the work order's own `assigned_office` — no inline scoping logic.
- Sidebar item ("Work Orders", under Management) shipped with the route. `/admin/work-orders` (list, filterable by status/office/overdue) and a Work Orders panel on `app/admin/tickets/[id]/page.tsx` (create + status update, scoped to that ticket).
- `notes` and every other work-order field are absent from every `api/src/citizens/*` response and the citizen tracking timeline — no citizen-facing surface exists, and none should be added.
- Audit events (`work_order_created/updated/status_changed/completed/cancelled`) log field names on update, never note bodies.

**Folded into Work Orders, not built as separate features:** internal notes (the office progress trail on a work order) and due dates (drive the pending/in-progress/overdue workflow — "overdue" is *derived* from `due_date < now()` and status, not a stored fourth status). Do not split either back out into its own page, table, or sidebar entry.

### Office-scoped Admin Directory / Assigned Admin Picker — **completed**

Closes the "known limitation" that used to live here: `assigned_admin_id` was schema/API-complete since Work Orders shipped, but no office-scoped read endpoint existed to populate a picker with — `GET /admin/admins` is System-Administrator-only.

- `GET /admin/admins/directory` (`AdminDirectoryController`, `api/src/admin/admin-directory.controller.ts`) — guarded only by `AdminSessionGuard` (not `SystemAdminGuard`, which stays exactly as strict as before on `AdminsController`), so MEO/MDRRMO can reach it. Scoped via `resolveOfficeScope`, the same helper every other office-scoped endpoint uses — an office admin's `?office=` query param can't widen the result. Returns only `{id, name, email, office, role}` for **active**, **officer/supervisor** accounts — never password/session/security columns, never inactive rows, never `system_admin` rows (their office is always `null`, so they could never validly be a work order's assignee anyway).
- `WorkOrdersService.create`/`update` (`api/src/admin/work-orders.service.ts`) now validate `assignedAdminId` server-side before accepting it: the target admin must exist, be active, and belong to the *work order's* office (not the caller's) — a mismatch on any of those is a 400, not a silent accept. This closes the gap where the field existed but was never checked.
- Frontend: `WorkOrderAssigneeSelect` (new, mirrors the existing `WorkOrderStatusSelect` pattern) renders in the Ticket Detail Work Orders panel and both the `/admin/work-orders` desktop table and mobile cards — office-scoped by the work order's own fixed `assigned_office`, editable inline. `CreateWorkOrderDialog` gained the same picker for creation, with an "Unassigned / Office-wide" option always available; a system admin creating from the standalone list (where no ticket office is known yet) gets an explicit office selector that filters the assignee options and clears any stale selection when changed.
- Audit: `assignedAdminId` changes are logged as part of the existing `work_order_updated` event, with `{from, to}` admin ids in the metadata — bare integers, never note bodies. No new action type was needed.
- No new route, no new sidebar item — the picker lives inside Work Orders' existing surfaces.

### Office Performance Summary — **completed**

A dashboard section, not a new route — the admin dashboard (`app/admin/page.tsx`) now shows an "Office Performance Summary" card assembled from data Work Orders, the ticket urgency pipeline, and Flagged Reports moderation already produce. No new sidebar item, matching the "ship the nav entry with the route" rule — this was never meant to get its own route.

Six metrics: Pending Work Orders, In Progress Work Orders, Overdue Work Orders, Completed Work Orders This Week, High-Urgency Open Tickets, Flagged Reports Pending Review.

- `WorkOrdersService.getOfficePerformanceCounts` (Drizzle, `api/src/admin/work-orders.service.ts`) computes the four work-order counts; `GET /admin/dashboard` (`api/src/admin/dashboard.controller.ts`) assembles the full summary by combining that with the existing `DashboardService.getDashboardKpis().high_urgency_count` and `ModerationService.getModerationStats().pending` — three already-scoped service methods, no new query engine.
- Office-scoped for MEO/MDRRMO via `resolveOfficeScope`, same as every other dashboard card — the frontend never filters, the backend never returns another office's counts. System admins additionally get a MEO vs. MDRRMO comparison table (`byOffice`), following the exact "system-admin-only, city-wide" rule the existing Department Workload card already uses.
- Never returns work-order note bodies or any other note content — counts only.
- Loading/error handling reuses the dashboard's existing single-fetch pattern (`DashboardSkeleton`/`DashboardError`) — the summary is part of the same `GET /admin/dashboard` payload as everything else on the page, not a separately-fetched section.

---

## 3. Next Product Features

In priority order. Work Order Follow-up Improvements is first since it's the direct continuation of what §2 just shipped.

### 3.1 Work Order Follow-up Improvements

Small increments on top of the shipped Work Orders + assignment-picker feature — e.g. bulk status actions, richer overdue surfacing, notification tuning. Scope these individually as they come up; do not batch speculative additions here ahead of an actual need.

### 3.2 URL-synced Admin Map Filters

`MapFilterState` in `components/features/admin/map/MapFilterBar.tsx` is currently client React state only — the map reads just `?office=` from the URL. Sync it to URL/query params, following the pattern the Ticket Queue already uses. This is purely the plumbing change; it unblocks §3.3 but doesn't itself add any office presets.

### 3.3 Office-specific Map Presets / Layers

**Blocked on §3.2 — do not build until map filters are URL-synced.** A preset link that lands on an unfiltered map is a fake navigation link, which is exactly the failure this ordering exists to prevent.

Once unblocked: **MEO** presets — drainage, road damage, illegal dumping, infrastructure. **MDRRMO** presets — flood/hazard reports, high urgency, low-elevation areas.

### 3.4 Reporting and Export Tools

CSV/PDF export or scheduled reports for tickets, work orders, and office activity — for handoff to LGU leadership or external stakeholders outside the admin UI. Scope precisely against a real request when it comes up; "export everything" is not a spec.

### 3.5 Production Hardening / Deployment Readiness

Last on this list because it's continuous, not a single feature: monitoring/alerting, backup verification, load/perf validation, secrets rotation, deployment runbook. Revisit and expand this item as the system approaches real deployment, rather than treating it as a one-time checkbox.

---

## 4. Deferred Enhancements

Not next, not blocked — just not prioritized yet. Revisit if a real requirement surfaces:

- Bulk work-order operations beyond what §3.1 scopes concretely
- Cross-office reporting rollups beyond §3.4's initial export scope
- Citizen-facing work-order status summaries (a *rollup*, e.g. "work in progress," never the underlying work order or its notes — see §5)

---

## 5. Do Not Build Yet

- Anything from §4, or later items in §3, ahead of earlier §3 items — the order in §3 reflects real dependencies (§3.3 needs §3.2), not preference.
- **Sidebar or Quick Action entries for routes that do not exist.** Every nav item must resolve to a real page with a real backing endpoint — ship the nav entry with the route, never ahead of it. Office Performance Summary and the Admin Directory/Assigned Admin Picker (§2) are both the model: real backend + UI, no sidebar item, because neither needed its own route.
- Any citizen-facing surface for work orders or internal notes — not even a rollup, until §4 is explicitly picked up and scoped.
- Office-specific map presets/links before §3.2's URL-sync work lands (§3.3).
- A standalone internal-notes or due-dates feature — both stay inside Work Orders (§2).
- A separate route/sidebar item for Office Performance Summary or the Admin Directory — both are dashboard/Work-Orders-surface features by design; only add a dedicated route if a real, separately-scoped need for one shows up.

---

## 6. Risks to Avoid

- **Weakening RBAC.** Client-side hiding (sidebar, quick actions) is cosmetic. The gate is `AdminSessionGuard` / `SystemAdminGuard` plus `resolveOfficeScope` / `assertOfficeAccess`. A new endpoint — including `AdminDirectoryController` — that forgets the scope helpers is an office-data leak, not a UI bug.
- **Fake navigation links.** Links to nonexistent routes, or to filtered views the target page can't actually apply, make the system look finished where it isn't — the exact failure §3.3's ordering exists to prevent.
- **Exposing internal work orders or notes to citizens.** `notes` and every other work-order field are staff-only by design; a rollup summary (§4) is the only citizen-facing form ever worth considering, and only once explicitly scoped.
- **Schema drift.** Any new table/column requires a matching `docs/database.md` entry in the same change.
- **Severity vs. Urgency vs. Priority.** Three distinct concepts with distinct data sources — see the terminology section in `CLAUDE.md` before labeling anything in a new UI.
- **Scope creep.** Ship the fields/behavior actually specified for the current item. Attachments, checklists, cost tracking, and crew scheduling are not in scope for Work Orders or its near-term follow-ups unless a §3 item says otherwise.
