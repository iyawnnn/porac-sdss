# Project Status

**Purpose.** This is the **active project status and roadmap file** for Porac SDSS. Read it before proposing or starting any work. It answers five questions:

- **What has shipped** — §2 (foundation) and §3 (recently completed operational features).
- **What is queued now** — §4.
- **What is deferred** — §5. Considered, set aside, not scheduled.
- **What must not be built yet** — §6.
- **What risks and constraints future work must respect** — §7.

Porac SDSS is a real operational system for MEO/MDRRMO, not an MVP prototype to be discarded once a demo is over — treat every item below as a production feature with production stakes (RBAC, audit trail, data integrity), not a proof of concept.

**Related docs.** `PLAN.md` is the historical architecture/decision record (why things are built the way they are, written against an earlier target). For what the system currently *does*, see [`features.md`](features.md) and [`user-flows.md`](user-flows.md). For the scoring model, [`triage-model.md`](triage-model.md). For security, [`security.md`](security.md) and [`security-hardening-plan.md`](security-hardening-plan.md). For verification, [`testing.md`](testing.md). For pre-production work, [`deployment-readiness.md`](deployment-readiness.md).

This file replaced two earlier documents that split the same material and each claimed to be the authority on what to build next. **There is exactly one roadmap/status file — this one.** Do not create a second roadmap, backlog, or "next steps" document.

---

## 1. Current State Summary

**Phase: polish, testing, security hardening, and deployment readiness.** Not feature development.

- **No new product feature is currently queued.** The pipeline that Barangay Insights and then Notification Center filled is clear, and the most recent audit found no remaining unfinished item of real product weight outside what §5 already defers.
- **Current work should focus on** reliability hardening, security hardening, test coverage, documentation accuracy, and deployment readiness — all of which are enumerated in §4.
- **Do not treat an empty feature queue as licence to start something new.** Read §6 before proposing a feature. If a genuinely new feature is justified, it belongs in §4 with a stated reason, not started directly.
- **Nothing has been deployed.** No hosting platform, production database, domain, or verified email sending domain exists yet — see [`deployment-readiness.md`](deployment-readiness.md).

---

## 2. Completed Foundation

This section is a shipped-inventory checklist. For a walkthrough of how these surfaces actually behave, see [`features.md`](features.md); for the access-control model behind them, see [`security.md`](security.md).

Verified against the current tree, not assumed:

**Citizen side** — `app/(citizen)/`
- Report submission with photo/EXIF, server-computed elevation, barangay resolution (`report/`)
- Report list and per-report tracking timeline (`reports/`, `dashboard/reports/[id]/`)
- Citizen map (`map/`), account page, signup/login, forgot/reset password

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
- Deduplication, urgency triage, weather/DEM pipeline (see `PLAN.md` §6–§7 and [`triage-model.md`](triage-model.md))
- `docs/database.md` per-table reference and the `city_boundary_osm` import

Existing admin routes are exactly: `/admin`, `/admin/tickets`, `/admin/tickets/[id]`, `/admin/map`, `/admin/barangay-insights`, `/admin/barangay-insights/[barangayId]`, `/admin/flagged`, `/admin/reports`, `/admin/notifications`, `/admin/admins`, `/admin/activity-log`, `/admin/account`, `/admin/login`, `/admin/work-orders`.

---

## 3. Recently Completed Operational Features

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

### Work Order Follow-up Improvements — **completed (first increment)**

A small, focused pass on top of the shipped Work Orders feature — due dates and notes went from create-only/display-only to fully editable, plus a new dashboard "Needs Attention" section. No new table, no new route, no crew scheduling/cost tracking/attachments/checklists (explicitly out of scope, see §6).

- **Due date editing.** `WorkOrderDueDateEditor` (`components/features/admin/work-orders/WorkOrderDueDateEditor.tsx`) is a native `<input type="date">` + Clear button, used on both the Ticket Detail Work Orders panel and the standalone `/admin/work-orders` list (desktop table + mobile cards) — PATCHes the existing `PATCH /admin/work-orders/:id` endpoint, which already supported `dueDate` (including clearing it to `null`) since Work Orders shipped; no backend change was needed for the edit path itself.
- **Overdue / due-today derivation.** `getDueState()` (`components/features/admin/work-orders/WorkOrderStatusBadge.tsx`) replaces the old boolean `isOverdue()` (kept as a thin wrapper for compatibility) with a three-state `overdue | due_today | upcoming | none` derived purely from `due_date`/`status` — never a stored column. "Due today" uses server-local calendar-day boundaries (a single-timezone LGU tool doesn't need per-user timezone handling yet).
- **Notes editing.** `WorkOrderNotesEditor` (`components/features/admin/work-orders/WorkOrderNotesEditor.tsx`) turns the Ticket Detail panel's read-only notes line into an inline-editable textarea (click to edit, Save/Cancel) — still the single `work_orders.notes` column, still internal-only, never touched from any citizen-facing route or type. No separate notes/history table was needed: a single office progress note per work order is the actual usage pattern (folded into Work Orders originally, not split out — see the note under Office Work Orders above).
- **Needs Attention dashboard section.** New `NeedsAttention` card (`components/features/admin/dashboard/NeedsAttention.tsx`) on the admin dashboard, fed by `WorkOrdersService.getNeedsAttention()` (`api/src/admin/work-orders.service.ts`) via a `needsAttention` field on the existing `GET /admin/dashboard` payload — no new endpoint. Three small lists (top 5 each): overdue work orders, work orders due today, and active HIGH-urgency tickets that still have a pending/in-progress work order. Office-scoped via the same `resolveOfficeScope`-derived `office` the rest of `GET /admin/dashboard` already uses — MEO/MDRRMO admins see only their own office's items, system admins see city-wide (no MEO/MDRRMO breakdown, unlike Office Performance Summary — a breakdown table for three short lists wasn't worth the extra UI).
- **Audit.** No new action types were needed — `work_order_updated`'s existing `changedFields` metadata already included `'dueDate'` and `'notes'` by name (never the note body or the due-date value) since Work Orders shipped; this increment only added UI surfaces that exercise those existing code paths more often.
- **Notifications.** Deliberately not added — due-date changes and note edits are routine progress-tracking, not the "something needs a specific person's attention" pattern `work_order_assigned`/`work_order_created` cover. Revisit only if a real "my work order is now overdue" request comes up.
- Deferred to a later increment if a real need surfaces: bulk status/due-date actions across multiple work orders, notification tuning, a dedicated notes history/audit trail beyond the single current-value column.

### URL-synced Admin Map Filters — **completed**

`MapFilterState` (`components/features/admin/map/MapFilterBar.tsx`) — category, urgency, status, barangayName, search — was client React state only, and the map read just `?office=` from the URL. All of it is now URL-synced, following the Ticket Queue's `initialQueryState`/`buildParams`/`router.replace` pattern (`TicketsWorkspace.tsx`).

- `app/admin/map/page.tsx` parses and validates every filter from `searchParams` server-side (same allowlist-or-fall-back-to-default shape as `TicketsService.parseTicketQuery`), passing the result down as `initialFilters`/`initialLayer` props — an unknown/invalid value (e.g. `?category=NotReal`) never reaches the client as a filter that would just silently match nothing.
- `MapClient.tsx` seeds its `filters`/`mode`/`office` state from those props, then keeps the URL in sync with a `router.replace` effect (skips the first run, exactly like `TicketsWorkspace`) — changing a filter, switching Pins/Heatmap (`?layer=`), or (for a system admin) switching office all update the URL without remounting the map or losing Leaflet state.
- `MapControls.tsx`'s office toggle used to be a raw `<Link href="?office=...">` (a full navigation); it's now a callback (`onOfficeChange`) into the same client-side state/URL-sync path as every other filter, so there's exactly one mechanism instead of two competing ones.
- **Office remains the only security-sensitive filter, and nothing about its enforcement changed.** `GET /admin/tickets/geo` (`TicketsController.geo`) independently re-derives office via `resolveOfficeScope` from the session — a hand-crafted `?office=MDRRMO` request from an MEO session still only ever returns MEO markers, regardless of what the Next.js page or client state compute. Category/urgency/status/barangayName/search were already, and remain, client-side filters applied over that already-office-scoped dataset (`GET /admin/tickets/geo` has no server-side support for them, unlike the Ticket Queue's `getTicketsForAdmin`) — URL-syncing them doesn't change their trust level, since they can only narrow what an office admin was already authorized to see.
- Query params: `office`, `category`, `urgency`, `status`, `barangayName`, `search`, `layer`. Deliberately `barangayName`, not `barangayId` like the Ticket Queue — the map's barangay filter has always matched by name (populated from the fetched ticket set, and set by clicking a boundary polygon), and there was no existing numeric-ID plumbing on `AdminTicketGeoRow` to match against; inventing one wasn't in scope for a pure URL-sync pass.
- `router.replace` (not `push`), matching Ticket Queue/Work Orders — back/forward works at normal navigation granularity (e.g. dashboard → map), not per-filter-change, which is the same tradeoff those other workspaces already made.

### Office-specific Map Presets / Layers — **completed**

A dashboard section (`MapPresets`, `components/features/admin/dashboard/MapPresets.tsx`), not a new route or sidebar item — every preset is a real link to `/admin/map?...` using the query params URL-sync just added, so it lands on an actually-filtered map, never a fake navigation link.

- **MEO**: Drainage Issues (`category=Clogged Drain`), Potholes & Road Damage (`category=Pothole`), Illegal Dumping (`category=Illegal Dumping`), High-Urgency Open Work (`urgency=Critical`).
- **MDRRMO**: Flooding Reports (`category=Flooding`), Fallen Trees (`category=Fallen Tree`), High-Urgency Reports (`urgency=Critical`).
- Office-scoped admins get only their own office's presets, with no `?office=` param — the map already scopes to their session office server-side. A system admin sees both offices' presets, grouped under an MEO/MDRRMO label, each with an explicit `office=` param — their map otherwise defaults city-wide, so the param is what actually makes an "MEO preset" MEO-only.
- **Deferred, not built**: a "low-elevation / hazard-prone areas" MDRRMO preset — there is no elevation-based map filter today (only category/urgency/status/barangayName/search), and inventing one wasn't in scope for this pass. Revisit only alongside a real elevation-filter feature, not as part of a presets-only change.
- No new route, no sidebar item — same "ship the nav entry with the route" rule Office Performance Summary and Needs Attention already follow.

### Reporting and Export Tools — **completed**

CSV export for Tickets and Work Orders, plus a centralized `/admin/reports` "Reports & Exports" workspace layering a shared filter UI and a printable operational summary on top of the same export endpoints — reusing the same office-scoped filter parsing the list endpoints already validate against throughout. No PDF (no PDF library existed and none was worth adding).

- `GET /admin/reports/tickets.csv` and `GET /admin/reports/work-orders.csv` (`ReportsController`/`ReportsService`, `api/src/admin/reports.*`) — behind `AdminSessionGuard`, no extra guard needed (same shape as `AdminDirectoryController`: safe because of what it delegates to, not a guard of its own). Unchanged by the `/admin/reports` page below — the backend endpoints remain the real security gate for every export, whether the request comes from Ticket Queue, Work Orders, or the new Reports & Exports page.
- **Office scoping is not reimplemented** — `ReportsService.ticketsCsv`/`workOrdersCsv` call `TicketsService.parseTicketQuery`/`WorkOrdersService.parseQuery` directly, the exact functions `GET /admin/tickets`/`GET /admin/work-orders` already use, so `resolveOfficeScope` is applied identically; an export can never see more than the equivalent list view already allows. Only the date-range (`dateFrom`/`dateTo`) parsing is new, added in `ReportsService.parseDateRange`.
- New `TicketsService.getTicketsForExport` / `WorkOrdersService.getWorkOrdersForExport` — unpaginated variants of the existing list queries, capped at 5,000 rows (`ponytail:` marked — revisit with a streaming writer if a real dataset ever needs more). Work orders export left-joins `admins` for the assignee's name/email; **never selects `notes`** — the internal note body is excluded at the query level, not filtered out after the fact, matching the same rule Work Orders' dashboard summaries already follow.
- `api/src/common/utils/csv.ts` — a small hand-rolled RFC 4180 writer (quote/escape on comma, quote, or newline); no dependency added for something this simple.
- Ticket CSV columns: Ticket ID, Status, Assigned Office, Urgency Band, Priority Score, Category, Barangay, Report Count (`member_count`), Created At, Updated At. Work Order CSV columns: Work Order ID, Ticket ID, Title, Assigned Office, Assigned Admin Name, Assigned Admin Email, Status, Overdue (derived, same rule as `WorkOrderStatusBadge.getDueState`), Due Date, Completed At, Created At, Updated At.
- Filters: `office`, `status`, `urgency`, `category`, `barangayId`/`search` (tickets) or `assignedAdminId`/`overdue` (work orders), plus `dateFrom`/`dateTo` on both — an invalid date is a real 400, an invalid enum value (category/urgency/status) falls back the same silent-default way every other admin list endpoint already does.
- "Export CSV" buttons remain on `TicketsWorkspace`/`WorkOrdersWorkspace` (`components/features/admin/{tickets,work-orders}/*Workspace.tsx`), linking to the export endpoint using each page's own existing `buildParams(query)` — unchanged by the new page below.
- **`/admin/reports` — "Reports & Exports" page** (`app/admin/reports/page.tsx`, `components/features/admin/reports/ReportsWorkspace.tsx`), sidebar entry under Management. This reverses the earlier "no standalone route" decision from this section's first version, now that there's real functionality beyond duplicating the existing per-page export buttons: a shared office/date-range filter panel driving both CSV exports at once, ticket status/category/urgency and work-order status/assigned-admin filters, and a printable operational summary (see below). It builds export URLs client-side from the selected filters and links straight to the existing `GET /admin/reports/*.csv` endpoints — it does not call a new backend export endpoint or duplicate `ReportsService`'s logic; the backend endpoints stay the only place office scoping is enforced.
- **Printable operational summary** — a `@media print` (Tailwind's built-in `print:` variant, no new dependency) summary card sourced from the existing `GET /admin/dashboard` response (`officePerformanceSummary`, `kpis.active_count`, `statusDistribution` summed for a total-tickets count) — no new backend query. A system admin's office filter on the page re-fetches `GET /admin/dashboard?office=...` to re-scope the summary; MEO/MDRRMO admins see only their own office's numbers, matching every other office-scoped view. "Print summary" triggers `window.print()`; filter controls and buttons hide via `print:hidden` so only the summary prints.
- **Audit logging was evaluated and deliberately skipped.** `AdminAuditService`'s schema requires a specific `targetId`/`targetType` for every event (`admin | ticket | report | work_order`) — a read-only, filter-driven export has no single target to attach an event to, and inventing a synthetic one (e.g. `targetId: 0`) would be a schema-shape hack for a feature that isn't a mutation. Revisit only if a real "who exported what" compliance need surfaces, as its own scoped change.
- **Still deferred**: PDF generation (the print stylesheet covers the "printable summary" need without a PDF library); cross-office reporting rollups beyond the existing MEO/MDRRMO office filter; scheduled/recurring reports.

### Barangay Insights — **completed (MVP)**

A read-only per-barangay operational drill-down: `/admin/barangay-insights` (all 29 barangays, office-scoped summary counts) and `/admin/barangay-insights/[barangayId]` (profile), sidebar entry in the Main section. This was the "Build Next" item once the roadmap pipeline emptied out.

- `BarangayInsightsController`/`BarangayInsightsService` (`api/src/admin/barangay-insights.*`) — `GET /admin/barangay-insights` and `GET /admin/barangay-insights/:id`, behind `AdminSessionGuard` only, same shape as `ReportsController`: safe because every count is office-scoped via `resolveOfficeScope`, not a guard of its own. Raw-PG (`PG` client), since every query joins `barangays.geom`/`dem_points.geom`.
- **No schema change.** Every aggregate is a `GROUP BY`/`COUNT(*) FILTER` over `tickets`/`reports`/`dem_points`, following the exact office-scoping shape `DashboardService` already uses — the index query moves the office filter into the `tickets` `LEFT JOIN` condition (not a `WHERE`) so all 29 barangays are always returned, even ones with zero tickets for the scoped office.
- Index columns: Total/Active/Resolved/High-Urgency ticket counts, most common category, last activity date. Profile adds: KPI tiles, an all-time category breakdown, a fixed 30-day incident trend (no range selector — this is a barangay profile, not a second dashboard), a `dem_points`-derived elevation min/avg/max (**display only, never a filter**), and the 10 most recent tickets, each linking to `/admin/tickets/{id}` and to `/admin/tickets?barangayId={id}` for the full filtered queue.
- Never selects `work_orders.notes` (this feature never touches `work_orders` at all).
- **Out of MVP, not built**: editing/creating/deleting barangays, CSV export, elevation *filtering*, crew scheduling, due-date calendars, inspection logs, attachments/checklists — see §5 for the full deferred list and reasons.

### Notification Center — **completed**

A full notifications page backing the existing bell — `/admin/notifications`, sidebar entry under Management. Closes the gap where the bell showed only the latest 10 with no filter, no pagination, and no history.

- Available to all three roles (System Admin, MEO, MDRRMO) — the route carries no extra guard beyond `AdminSessionGuard`, and each admin sees only their own and their office's rows, using the same `NotificationsService` scoping (`scopeFilter`) every other notification read already goes through. No RBAC surface of its own.
- `GET /notifications?before=&limit=&status=&type=` — the cursor pagination and `nextCursor` `NotificationsService.listForPrincipal` already computed were simply wired up on the frontend instead of discarded; `status` (`all`/`unread`/`read`) and `type` are additive narrowing filters, same pattern as every other admin list endpoint's optional filters.
- No schema change, no new backend service — `NotificationCenterWorkspace` (`components/features/admin/notifications/`) is the only new surface of substance.

### Citizen Resolution Feedback / Dispute Loop — **completed**

Closes the one-way finality gap where a citizen had no way to say a `Resolved` ticket wasn't actually fixed. A citizen can "Confirm Fixed" or "Report Still Not Fixed" on a resolved report, both persisted; the latter notifies the assigned office and surfaces on the existing Ticket Queue/Ticket Detail — no new sidebar item, no new admin page.

- `tickets.disputed_at`/`tickets.dispute_reason` (`api/drizzle/0022_ticket_disputes.sql`) — nullable columns, not a status value. `disputed_at` NULL means "not disputed" (single-outstanding-dispute gate). `tickets.resolution_confirmed_at` (`api/drizzle/0023_ticket_resolution_confirmation.sql`) is the positive-path mirror, same gate shape. See `docs/database.md`'s `tickets` entry.
- `POST /reports/mine/:id/dispute` (`ReportsController`/`ReportsService.disputeReport`) — citizen-session-gated, ownership+existence checked in one clause (`WHERE r.id = ... AND r.citizen_id = ...`, joined to the ticket), only allowed when `status = 'Resolved'`, race-safe duplicate rejection via `WHERE disputed_at IS NULL` on the UPDATE (same pattern as `moderation.service.ts`). Creates an office-targeted `ticket_disputed` notification linking to `/admin/tickets/:id`, inside the same transaction as the UPDATE.
- `POST /reports/mine/:id/confirm-resolution` (`ReportsController`/`ReportsService.confirmResolution`) — same ownership/resolved-only/race-safe-UPDATE pattern as the dispute endpoint; rejects if the ticket is already disputed or already confirmed. No notification (a confirmation isn't actionable by an office) and no admin-side surfacing, kept deliberately minimal.
- Admin Ticket Queue gets a "Disputed only" toggle (same shape as Work Orders' "Overdue only") and a "Disputed" badge on each row/card; Ticket Detail shows the disputed date and the citizen's reason. Office scoping is unchanged — the disputed filter rides the same `filters.office` clause every other filter already goes through.
- Never touches `urgency_score`/`priority_score`/`priority_index`/`urgency_band`/`status`/duplicate-detection/work-order logic — a workflow signal layered on top of `Resolved`, not a scoring input or a status rollback.

### "My Assignments" Work Order Filter — **completed**

A personal quick filter on the existing `/admin/work-orders` list — no new page, no new sidebar item, matching §6's rule against inventing a separate route for what's really a filter (the earlier "My Work" recommendation was explicitly scoped this way).

- `WorkOrdersService.parseQuery` now accepts `assignedAdminId=me` as a viewer-relative sentinel, resolved server-side from the caller's own session (`admin.adminId`) — never a client-supplied numeric id, so it can't be used to probe another admin's assignments by id. Works identically for MEO/MDRRMO officers, supervisors, and system admins (every `AdminSession` carries its own `adminId`). Raw numeric `assignedAdminId` values are unaffected. This is the one existing filter path (`list`/`getWorkOrdersForExport`, and the CSV export that reuses `parseQuery`) — no parallel logic was added.
- `WorkOrdersWorkspace.tsx` gets a "My Assignments" toggle button (same shape as the existing "Overdue only" toggle) plus an active-filter badge when enabled; the URL carries `?assignedAdminId=me` literally (not a resolved numeric id), so the link means "my assignments" for whoever opens it. Combines with office/status/overdue rather than replacing them.
- Office scoping is unchanged — `resolveOfficeScope` still runs first in `parseQuery`, so an MEO/MDRRMO admin's "My Assignments" is still clamped to their own office.
- No schema change, no migration, no new endpoint.

### Ticket Escalation Notifications — **completed**

A backend-only safety net: flags active tickets that have stalled with no real field-work progress, so they don't silently age out of view. No new page, no new sidebar item — it's a notification, delivered through the existing bell/Notification Center.

- `EscalationService.checkTicketEscalations` (`api/src/domain/escalation.service.ts`) — active ticket (`Reported`/`Under Review`/`In Progress`) older than 7 days with no work order that ever reached `in_progress`/`completed` (a `pending`/`cancelled`-only work order, or no work order at all, still counts as stalled). Read-only against `tickets`/`work_orders`/`notifications` — never writes `tickets.status`, `work_orders.status`, or any urgency/priority column.
- `POST /cron/check-ticket-escalations` (`CronController`), behind the same `CronSecretGuard` as every other cron route, added to `.github/workflows/cron.yml`'s daily run alongside the other five (six total — see §4.4). Returns `{ candidatesFound, notificationsCreated, duplicatesSkipped }`.
- Notification: `type: 'ticket_escalation'`, office-targeted (`recipientOffice`, no per-admin fan-out — same shape as `ticket_critical`), linking to `/admin/tickets/:id`.
- **Duplicate prevention is schema-free**: a ticket is escalated at most once for the lifetime of its `ticket_escalation` notification row — before creating one, the service checks whether `notifications` already has a `type: 'ticket_escalation'` row for that `entityId` and skips it if so, rather than adding a new "already escalated" column to `tickets`. Re-escalating after a stall recurs is a deliberate non-goal for this pass, not an oversight.
- No schema change, no migration.

### Citizen Case Closure Summary Card — **completed**

A read-only recap of how a resolved report was closed, on the existing citizen report detail page (`/dashboard/reports/[id]`) — no new page, no new sidebar item, no new workflow.

- `CaseClosureSummary` (`components/features/citizen/dashboard/CaseClosureSummary.tsx`) renders only when `report.status === "Resolved"`, above the existing `ResolutionFeedback` action card — a read-only recap of the outcome, distinct from the confirm/dispute action itself. Shows the resolved date (`ticket_updated_at`), resolution notes if any, the resolution photo if any, and a one-line recap of the citizen's own confirm/dispute feedback state if they've already given it.
- `MyReportDetail`/`getMyReportDetail` (`api/src/reports/reports.service.ts`) gained one field, `resolution_image_url` — already selected on the admin `TicketDetail` query, just missing from the citizen one. No schema change, no new endpoint; `dispute_reason` stays excluded from the citizen DTO exactly as before (the citizen already knows their own words, only the state is shown here).
- Reuses `ReportImage` (citizen-safe image with broken-image fallback) for the photo — no new image-handling component.
- Dispute/confirm endpoints, ticket status behavior, and the `ResolutionFeedback` action flow are unchanged.

### Root and Admin SSR/API Error Boundaries (R10) — **completed**

`app/error.tsx` (new) and `app/admin/error.tsx` (new) — a transient Next → NestJS socket failure in `getAdminSessionFromApi()`/`getCitizenSessionFromApi()` (`lib/api-client.ts`, after its bounded retries) no longer replaces the whole admin or citizen app with Next's unbranded default error screen.

- `app/error.tsx` is the boundary that actually catches admin/citizen **layout** throws — `error.js` does not wrap the `layout.js` above it in the same segment, so `app/admin/error.tsx` alone cannot catch a throw from `app/admin/layout.tsx`. Neutral copy for both audiences, no session read, no API call.
- `app/admin/error.tsx` is the admin page-level boundary, parity with the six existing `app/(citizen)/**/error.tsx` boundaries. Not a wrapper around `CitizenErrorState` — that component hard-codes `reset`, is citizen-scoped, and is untouched here.
- Both use `unstable_retry()`, this build's recovering prop (re-fetches and re-renders the boundary's children), not `reset()` (clears state without re-fetching). The citizen boundaries still use `reset` — fixing that is a separate, already-tracked issue (#12/#45), not part of this change.
- `settleAdminPage` (`e2e/helpers.ts`) is unchanged and stays as defense-in-depth for mid-run connection churn between navigations; its comment now reflects that the boundary exists.
- No change to `lib/api-client.ts` retry counts or throw behavior — the throw was correct, the missing boundary was the bug.

### Baseline HTTP Security Response Headers (R2) — **completed**

`next.config.ts`'s `headers()` applies four static headers to every route: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), camera=(), microphone=()` — closing the clickjacking gap against destructive single-click admin controls (status advance, office reassignment, deactivation).

- Set on the Next.js side only — the API returns JSON to a same-origin proxy, so no `helmet` dependency was added there.
- The `Permissions-Policy` denies are ones the app provably never calls: grepped the full app source for `navigator.geolocation`/`getUserMedia` and found neither. The report form's pin comes from EXIF GPS on the uploaded photo or a manual Leaflet marker click, never the browser geolocation API.
- Content-Security-Policy is deliberately **not** part of this change (R7, staged separately in `Report-Only` mode first — a blocking CSP shipped blind would break Leaflet tiles and Cloudinary images).
- `rewrites()` (the `/api/*` proxy) and API behavior are unchanged — `headers()` is a sibling config key.
- Regression test: `e2e/smoke.spec.ts` asserts all four headers on `/admin/login` and `/login`.

### Failed-Login Throttling for Admin Login (R1) — **completed**

Per-account failed-login throttling, closing the highest-severity gap in the hardening plan — an attacker who knows one admin address (`README.md` §G publishes the convention) could previously make unlimited password guesses, slowed only by bcrypt's cost.

- New table `admin_login_rate_limit_events` (migration `0024_admin_login_throttle.sql`, `pnpm --prefix api migrate:admin-login-throttle`) — not a reuse of `rate_limit_events` (raw-PG-only, `geom NOT NULL`, wrong identity shape) or `password_reset_rate_limit_events` (same column shape, but a different security domain already in active use by citizen forgot-password requests; mixing rows would corrupt both tables' counts). See `docs/database.md` §D/§G for the full reasoning.
- Three new `RateLimitService` methods: `checkAdminLoginRateLimit`/`recordAdminLoginFailure` follow the existing check-then-record pattern; `resetAdminLoginFailures` is new territory for this service — it actively deletes an email's failure rows on a successful login, rather than only letting a window expire, which is what acceptance criterion #2 ("a successful login resets the counter") requires.
- **Keyed on normalized account email, never IP** — an IP-based total-login limit would break the E2E suite, which authenticates from one IP nearly 200 times per run (`docs/testing.md` §6). 10 failures within 15 minutes throttles further attempts against that email.
- `AuthService.adminLogin` checks the throttle *before* querying the `admins` table or running bcrypt, so a throttled request never records a further failure of its own — the cooldown is bounded to ~15 minutes after the failure that tripped it, not indefinitely extendable by continued attempts during the cooldown.
- The throttled response is the exact same `UnauthorizedException('Invalid email or password')` as every other rejection reason (nonexistent email, deactivated admin, wrong password) — no distinct status, message, or header. A failure is recorded for all of those reasons uniformly, never only for real/active accounts, so the throttle itself can't become a second enumeration side-channel.
- `POST /cron/cleanup-rate-limit-events` now prunes this table too, same 30-day retention.
- `AuthModule` provides `RateLimitService` directly rather than importing `DomainModule` — `DomainModule` imports `NotificationsModule`, which imports `AuthModule`, so importing `DomainModule` from `AuthModule` would create a circular module dependency. `RateLimitService` only needs the globally-provided `PG` client, so a standalone provider resolves fine.
- No MFA, CAPTCHA, permanent lockout, IP-based total-login limiting, citizen-side login throttling, or test-only bypass — all explicitly out of scope. `citizenLogin`/`citizenSignup` untouched.
- Verified against `e2e/admin-password.spec.ts` and `e2e/admin-rbac.spec.ts` (not the full suite, per `docs/testing.md` §6) — no regression.

### Free-Text Length Bounds (R3) — **completed**

Five admin-side/dispute free-text fields had type and non-empty checks but no maximum length: `work_orders.title`/`notes`, `tickets.resolution_notes`, `tickets.dispute_reason`, and the moderation `note`. Report submission was already bounded by Zod; these were not.

- Five named constants in `api/src/contracts/schemas.ts`: `WORK_ORDER_TITLE_MAX_LENGTH` (200), `WORK_ORDER_NOTES_MAX_LENGTH` (2000), `TICKET_RESOLUTION_NOTES_MAX_LENGTH` (2000), `TICKET_DISPUTE_REASON_MAX_LENGTH` (1000), `MODERATION_NOTE_MAX_LENGTH` (1000) — kept separate from `reportSchema`'s own inline `.max()` values even where the numbers match, since those fields sit in services with no Zod parsing.
- Each guard is a plain `if (...) throw new BadRequestException(...)` added in the method that already validated that field — `WorkOrdersService.create`/`update`, `TicketsService.advanceStatus`, `ReportsService.disputeReport`, `ModerationService.moderateReport` — no validation moved to a new layer.
- `disputeReport` already enforced 1000 characters; that check was converted from a bare `1000` literal to the named constant, not new logic.
- No truncation anywhere — over-length input is rejected with 400, matching the pattern each method's existing checks already used.
- No database migration, no `varchar` column change, no new validation library.
- One unit test per field: real-invocation tests in `work-orders.service.spec.ts`, `tickets.service.spec.ts`, and `moderation.service.spec.ts`; a source-text regression guard in `reports.service.spec.ts` (that file has no DB test harness, matching its existing test style for `disputeReport`).

### Admin Login Audit Events (R4) — **completed**

Natural companion to R1 (failed-login throttling) — R1 already computes the failure signal this needed. `admin_audit_events` previously covered every admin mutation but not authentication itself, so a compromised admin account left no login trail.

- Two new action types on the **existing** `admin_audit_events` table: `admin_login` (successful login) and `admin_login_failed` (failed attempt against an **existing** admin account — wrong password or deactivated). No new table, no new endpoint, no new page; the Activity Log page picks them up automatically via the existing `ACTION_TYPES` allowlist.
- **Nonexistent-email failed attempts are deliberately not audited.** `admin_audit_events.actor_admin_id`/`target_id` are `NOT NULL`, and there is no admin row to attribute an actor to in that case — inventing a synthetic id was rejected as the same schema-shape hack already disallowed for export audit logging. Skipping the write also avoids an internal side channel: a distinguishable audit path for "email doesn't exist" vs. "email exists but wrong password" would undermine the enumeration resistance `adminLogin` already provides, even though it never reaches the HTTP response.
- **Best-effort, not transactional** — the one exception to every other `admin_audit_events` write. `AdminAuditService.logBestEffort` (new method, reuses the already-injected Drizzle client) catches and logs insert failures rather than rethrowing, since a login has no accompanying state-change transaction to be atomic with, and a broken audit insert must never block a legitimate admin login.
- `AdminAuditService` is now provided directly in `AuthModule`'s own `providers`, mirroring exactly how `RateLimitService` is already provided there — `AdminModule` imports `AuthModule`, so importing `AdminModule` back would be circular.
- Zero changes to `RateLimitService` call order, the throttle logic, or the generic `'Invalid email or password'` message/timing from R1 — the audit calls are additions only, inserted around the existing control flow.
- Never logs the password, any part of it, its length, the session token, or any cookie value — only the same `{adminId, adminName, email, role, office}` actor snapshot every other action type already uses.
- Verified against `auth.service.spec.ts` (failed-against-existing-admin, successful login, no-password-material, and nonexistent-email-not-audited cases) and `admin-audit.service.spec.ts` (`logBestEffort` success and swallow-on-error), plus `e2e/admin-activity-log.spec.ts`/`e2e/admin-password.spec.ts` (not the full suite).

### Citizen Cross-Account Report Access Regression Test (R8) — **completed**

`ReportsService.getMyReportDetail`'s single-clause ownership check (`WHERE r.id = ... AND r.citizen_id = ...`) was correct in code but had no regression test — a future refactor that split "fetch by id" from "compare owner" could pass the existing suite while introducing an existence oracle.

- One new test in `e2e/citizen-reports.spec.ts` (`Cross-account access` describe block): a fresh citizen B requests citizen A's (citizen1's) seeded report id and a guaranteed-nonexistent id, asserting **both status and body** are identical between the two — the property that actually proves there's no existence oracle, not just "B didn't get A's data."
- **Zero new report submissions.** Reuses citizen1's existing seeded report via the already-present `fetchMyReports` helper; skips cleanly (`test.skip()`, naming `seed:diverse-reports`) if none exists, matching the file's established pattern used 3× elsewhere.
- Citizen B is a fresh signup (same inline UI-signup pattern already used twice in this file) — signups aren't rate-limited the way report submissions are, and a zero-report account is exactly what the test needs.
- `ReportsService`/`reports.controller.ts` untouched — this is a test-only change locking in already-correct behavior.
- Verified against `pnpm exec playwright test e2e/citizen-reports.spec.ts -- --workers=1` (not the full suite).

### CSV Export Office-Scoping and Note-Leak Regression Tests — **completed**

`ReportsService.ticketsCsv`/`workOrdersCsv` deliberately reuse `TicketsService.parseTicketQuery`/`WorkOrdersService.parseQuery` — the same `resolveOfficeScope` clamp the list endpoints use — so an export can never see more than its caller's own list view, and the work-order export excludes `notes` at the query level rather than filtering after selection. Both properties were correct in code but under-tested.

- Auditing `e2e/admin-reports.spec.ts` found 4 of this work's 5 required behaviors **already covered**: MEO/MDRRMO ticket CSVs contain only their own office's rows, a doctored `?office=MDRRMO` on an MEO session's export still returns only MEO rows, and the work-order CSV header never includes a `notes` column — all asserted via parsed CSV rows and column-index lookup, not substring matching.
- The one real gap: the existing "no notes column" test only checked the **header row**. One new test closes it — creates a work order with a sentinel note string (same technique as `admin-work-orders.spec.ts`'s citizen-leak test), exports the CSV, and asserts the sentinel appears nowhere in the raw response body, proving no note body leaks even in a data row.
- **Zero new reports.** The new test reuses whichever ticket already exists (`GET /api/admin/tickets?status=all&limit=1`) rather than creating a disposable one — it doesn't need a pristine or office-specific ticket, only *a* ticket to attach the sentinel-noted work order to.
- `api/src/admin/reports.service.ts` untouched — this is a test-only change locking in already-correct behavior.
- Verified against `pnpm exec playwright test e2e/admin-reports.spec.ts -- --workers=1` (not the full suite).

### Work-Order Office-Scoping Test Gaps Closed — **completed**

`e2e/admin-work-orders.spec.ts` already covered most office-scoping paths (read/update/status 403 both directions, list clamping, citizen 401, assignee-picker scoping, notes non-leak). Three paths, all backed by already-correct code, had zero test coverage.

- **MDRRMO → MEO work-order creation → 403.** The mirror of the existing MEO → MDRRMO creation-rejection test — enforcement was previously proven one-way only for the create path.
- **Cross-office `assignedAdminId` → 400, creates nothing.** `WorkOrdersService`'s `assertValidAssignee` (shared by `create`/`update`) validates the assignee is active and belongs to the *work order's* office — untested until now. Confirmed via both the status code and a follow-up list query (`GET /api/admin/work-orders?ticketId=...`) proving no row with the test's title exists.
- **Deactivated `assignedAdminId` → 400, creates nothing.** Same shared validation, same collapsed 400/message as the cross-office case — confirmed the same way, using a same-office throwaway admin so "inactive" is the isolated cause. One throwaway admin created via the raw API (`POST /api/admin/admins` + `.../deactivate`), `e2e`-prefixed so `cleanup:e2e-admins` removes it automatically.
- **Zero new tickets or reports.** All three tests reuse the existing `sharedMeoTicketId`/`sharedMdrrmoTicketId` fixtures from this file's `beforeAll`.
- `api/src/admin/work-orders.service.ts` untouched — the validation was already correct; these three tests close the coverage gap, they don't fix a bug.
- Verified against `pnpm exec playwright test e2e/admin-work-orders.spec.ts -- --workers=1` (not the full suite).

### Ticket Reassignment Security Tests Added — **completed**

Reassignment is not System-Administrator-only: `TicketsController.reassign` sits behind `AdminSessionGuard` alone, and `TicketsService.reassignOffice` checks `assertOfficeAccess` against the ticket's *current* office, not role — so an office admin who holds a ticket can hand it to the other office. It's a one-way move (the origin office loses access afterward). This was already documented correctly (`docs/user-flows.md` §2.6/§4.2) but `e2e/admin-tickets.spec.ts` only ever exercised reassignment as System Administrator, so nothing pinned the office-admin path.

- **MEO admin reassigns their own MEO ticket to MDRRMO → succeeds.**
- **After reassignment, that same MEO session gets 403 on the ticket and it is absent from their list** — the one-way lockout.
- **MEO admin attempting to reassign a ticket that's now MDRRMO's → 403** — they never had access to reassign it from there.
- **The reassignment writes an `admin_audit_events` row naming the acting admin (by id) and an `office_reassignments` row** — verified via `GET /admin/tickets/:id`'s `reassignments` array and `GET /admin/activity-log` as System Administrator.
- All four tests share one throwaway ticket via `describe.serial` and a `beforeAll` — one report added to the suite's budget (see [`testing.md`](testing.md) §6).
- `api/src/admin/tickets.controller.ts`/`tickets.service.ts` untouched — this pins existing, already-correct behavior; it does not change the reassignment permission model.
- Verified against `pnpm exec playwright test e2e/admin-tickets.spec.ts -- --workers=1` (not the full suite).

---

## 4. Current Queue

All pending work. **None of it is a new product feature** — this is hardening, testing, documentation, and deployment readiness, consistent with §1.

### 4.1 Security hardening — pending

Assessed and prioritized in [`security-hardening-plan.md`](security-hardening-plan.md), which carries severity, likelihood, right-sized scope, and the required test for each. Summarized here so this file stays the single status view:

- **Content-Security-Policy (R7, Low) — pending**, and deliberately staged after R2 in `Report-Only` mode first, since a blocking CSP shipped blind would break Leaflet and Cloudinary.

Deployment-topology items (proxy trust depth, API network exposure, TLS/HSTS, credential rotation) are in §4.4, not here — they cannot be resolved before a hosting platform exists.

### 4.2 Reliability — pending

Admin SSR error boundary (R10) shipped — see §3.

### 4.3 Testing — pending

Detail and rationale in [`testing.md`](testing.md) §9. None of these blocks other work; all are recorded so they aren't lost:

- **Per-run database isolation — pending.** The single change that would unlock parallel workers and remove most of the suite's constraints. Also the largest.
- **Wider fixture sharing — done for the read-only slice.** `admin-tickets.spec.ts`'s three purely-read tests (queue→detail nav, Ticket Detail read-only sections, mobile card list) now share one `sharedReadOnlyTicketId` fixture, cutting that file from 8 to 6 report-creating call sites and the full-suite total from ~17 to ~15 (see [`testing.md`](testing.md) §5–§6). Its remaining 5 call sites all mutate status, office, or resolution one-way and correctly stay isolated — no further reduction is possible there without database isolation.
- **Playwright in CI — pending**, and correctly gated behind database isolation. CI today runs API build, API unit tests, root lint, and root build — no browser tests.
- **Security-control tests — pending**, to be written alongside whatever ships from §4.1. Ticket-reassignment coverage already shipped — see §3.

### 4.4 Deployment readiness — pending

Full checklist in [`deployment-readiness.md`](deployment-readiness.md). Nothing has been deployed; no hosting platform is chosen.

**Already done in this area:**

- **Cron scheduling — done.** `.github/workflows/cron.yml` calls all six `api/src/cron/*` routes (`recompute-urgency`, `recompute-weather`, `cleanup-password-reset-tokens`, `cleanup-notifications`, `cleanup-rate-limit-events`, `check-ticket-escalations`) daily via `curl`, authenticated the same way `CronSecretGuard` already accepts (`Authorization: Bearer $CRON_SECRET`). Requires two repo-level GitHub Actions configs to actually run: `vars.PORAC_API_BASE_URL` and `secrets.CRON_SECRET` — see that workflow file's header comment.
- **Rate-limit event cleanup — done.** `RateLimitService.cleanupOldEvents()` + `POST /cron/cleanup-rate-limit-events` prunes `rate_limit_events` and `password_reset_rate_limit_events` past a 30-day retention window — see `docs/database.md` for why 30 days is safe (both tables' checks only ever look back 24 hours at most).
- **Setup/deployment documentation — done.** `README.md`'s env var setup section previously named variables that don't exist in this codebase (`OPENWEATHER_API_KEY`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`) and never mentioned `api/.env` as a separate file at all — a fresh clone following it literally could not start the API. Rewritten to explain the two-env-file split accurately (with tables of what's actually required vs. optional on each side, matching `api/src/config/env.ts`'s Zod schema) and to add a "Scheduled Jobs & Deployment" section documenting the `CRON_SECRET`/`PORAC_API_BASE_URL` GitHub Actions requirements and stating plainly that no hosting platform is decided yet.
- **Admin ticket workflow E2E coverage — done.** `e2e/admin-tickets.spec.ts` now covers the Ticket Queue and Ticket Detail end to end: queue baseline/empty state, status/search/disputed/category/barangay filters plus filter reset, office scoping (including a doctored `?office=` clamp assertion), queue → detail navigation and back, the Ticket Detail read-only surface, status advancement, office reassignment with a `finally`-block restore, pagination, sorting, the mobile card list, and a full admin-UI resolution through the resolve dialog (completion notes + resolution photo) whose outcome is then asserted from the citizen side against the Case Closure Summary card. `e2e/citizen-dispute.spec.ts` gained the matching citizen-side coverage (confirm/dispute persistence across reload, and a hydration/wait fix on the dispute flow).
- **Ticket-dependent E2E specs decoupled from shared state — done.** Specs that need a ticket now create their own disposable one (a fresh citizen signup + a real `POST /api/reports` with jittered coordinates, comfortably outside the 25m Pothole dedup radius) instead of selecting "whichever ticket currently ranks first" for an office. That shared top-of-list selection was the standing flake source: earlier specs create, resolve, and reassign tickets, so a later spec's "first ticket" could point at a different row — or one mid-mutation — than the one it read. Where a pristine ticket isn't required, files share a single disposable fixture created once (`admin-work-orders.spec.ts`'s `sharedMeoTicketId`/`sharedMdrrmoTicketId`, `admin-tickets.spec.ts`'s `resolvedFixture`), which is safe only under the suite's mandatory `--workers=1` and is commented as such at each site. **Known local caveat**, documented in `README.md` §I and [`testing.md`](testing.md): a full run posts ~16 real reports against `RateLimitService`'s 20/hour-per-IP backstop, so back-to-back full runs within the same hour fail with `429`. That is the anti-abuse control behaving correctly — the fix is targeted spec runs, never a test-only bypass.

**Still not done:** provisioning a production PostGIS database and running the documented migration order; automated backups and a **tested** restore; a verified email sending domain with a matching `EMAIL_FROM`; the two GitHub Actions cron values; monitoring/alerting; load and performance validation; credential rotation (deliberately gated on an actual deploy decision — see `PLAN.md` §0); re-deriving `trust proxy` depth for the real topology; ensuring the API is not publicly reachable independently of the proxy; TLS/HSTS; and a written deployment runbook (no hosting platform is committed anywhere in this repo yet).

---

## 5. Deferred Enhancements

Not next, not blocked — just not prioritized yet. Each needs a real, separately-scoped requirement before it moves into §4. Revisit if a genuine need surfaces:

- Bulk work-order operations and notification tuning beyond what §3's Work Order Follow-up Improvements increment shipped
- Cross-office reporting rollups beyond the MEO/MDRRMO office filter, scheduled/recurring reports, and PDF generation — beyond §3's Reporting and Export Tools' `/admin/reports` page and print-summary scope
- Citizen-facing work-order status summaries (a *rollup*, e.g. "work in progress," never the underlying work order or its notes — see §6)
- A low-elevation/hazard-prone map preset or filter — no elevation-based map filter exists yet (§3's Map Presets); revisit alongside a real elevation-filter feature
- Export audit logging — evaluated in §3's Reporting and Export Tools and skipped; revisit only if a real "who exported what" compliance need surfaces
- Crew scheduling, attachments/checklists, and inspection logs — all out of scope. Inspection logs in particular collide with the deferred attachments/checklists scope, so they are not a smaller separate item
- A standalone due-date calendar — due dates stay inside Work Orders (§6)
- CSV export for Barangay Insights, and barangay create/edit/delete flows — both deliberately out of that feature's shipped scope (§3's Barangay Insights)
- Elevation *filtering* anywhere in the product — elevation is display-only today (§3's Barangay Insights, and the map-preset entry above)
- **A `Rejected` ticket-status transition/action.** The `Rejected` value already exists in the `ticket_status` enum and both frontend/backend constant sets (deliberately, matching the manuscript lifecycle), and has supporting UI/copy/email-template code, but `NEXT_STATUS` (`api/src/admin/ticket-constants.ts`) and `TicketsService.advanceStatus` never produce it — there is no reject call site today. Wiring one also needs a `STATUS_NOTIFICATION.Rejected` entry (`tickets.service.ts`), since the existing rejection email is currently unreachable behind that map. Confirmed by the Phase 1 terminology audit (2026-08-15); see [`triage-model.md`](triage-model.md) §2 and [`features.md`](features.md) §4.2.
- **Dashboard "High Urgency Tickets" link parses no filter.** `DashboardClient.tsx` links to `/admin/tickets?urgency=Critical`, but `TicketsWorkspace.tsx`'s query parsing never reads an `urgency` param — the link lands on an unfiltered queue. Found during the Phase 1 terminology audit (2026-08-15); not fixed there since it's a behavior change, not wording.
- **Public hazard map's active-ticket filter omits `Under Review`.** `ReportsService`'s public map query (`reports.service.ts`) filters `status IN ('Reported', 'In Progress')` — every other "active" status set in the codebase (~12 sites) is `('Reported', 'Under Review', 'In Progress')`. A ticket disappears from the citizen-facing map for the duration of Under Review. Found during the Phase 1 terminology audit (2026-08-15); not fixed there since it changes citizen-visible map content.

---

## 6. Do Not Build Yet

- Anything from §5, or later items in §4, ahead of earlier §4 items — the order in §4 reflects real dependencies and severity, not preference.
- **Sidebar or Quick Action entries for routes that do not exist.** Every nav item must resolve to a real page with a real backing endpoint — ship the nav entry with the route, never ahead of it. Office Performance Summary, the Admin Directory/Assigned Admin Picker, and Map Presets (§3) are all the model: real backend + UI, no sidebar item, because none needed its own route.
- Any citizen-facing surface for work orders or internal notes — not even a rollup, until §5 is explicitly picked up and scoped.
- A standalone internal-notes or due-dates feature — both stay inside Work Orders (§3).
- A separate route/sidebar item for Office Performance Summary, the Admin Directory, or Map Presets — all are dashboard/existing-surface features by design; only add a dedicated route if a real, separately-scoped need for one shows up.
- A generic **"Analytics"** sidebar label — must not be used as a nav label; the E2E suite asserts against the exact sidebar entry list, and a rename would break it without adding meaning. Use the specific feature name instead (e.g. "Barangay Insights").
- Anything that weakens RBAC or office scoping, including a test-only bypass of a rate limit or guard. See §7 and [`security.md`](security.md) §8.3.

---

## 7. Risks to Avoid

- **Weakening RBAC.** Client-side hiding (sidebar, quick actions) is cosmetic. The gate is `AdminSessionGuard` / `SystemAdminGuard` plus `resolveOfficeScope` / `assertOfficeAccess`. A new endpoint — including `AdminDirectoryController` — that forgets the scope helpers is an office-data leak, not a UI bug. The admin map follows the same rule: URL-syncing `?office=` (§3) is a UX convenience, not the security boundary — `TicketsController.geo` re-derives office from the session independently of whatever the client sends. See [`security.md`](security.md) §3.
- **Fake navigation links.** Links to nonexistent routes, or to filtered views the target page can't actually apply, make the system look finished where it isn't — the exact failure Map Presets (§3) was ordered behind URL-synced filters to prevent.
- **Exposing internal work orders or notes to citizens.** `notes` and every other work-order field are staff-only by design; a rollup summary (§5) is the only citizen-facing form ever worth considering, and only once explicitly scoped. See [`security.md`](security.md) §7.
- **Schema drift.** Any new table/column requires a matching `docs/database.md` entry in the same change.
- **Severity vs. Urgency vs. Priority.** Distinct concepts with distinct data sources — and there are *two* separate scoring formulas, not one. Read [`triage-model.md`](triage-model.md) before labeling anything in a new UI or changing any weight or threshold; that file also carries the change-control rule for keeping the frontend duplicates and tests in sync.
- **Scope creep.** Ship the fields/behavior actually specified for the current item. Attachments, checklists, cost tracking, and crew scheduling are not in scope for Work Orders or its near-term follow-ups unless a §4 item says otherwise.

---

## 8. Maintenance Rule

**Update this file in the same change whenever a feature, hardening task, deferred item, or do-not-build rule changes state.** A status file that lags the code is worse than none — the next session, human or agent, will trust it.

Specifically:

- A completed feature moves into §3 with enough detail that the next reader understands what shipped and what was deliberately left out.
- A completed §4 item is marked done there, and its entry in the owning detail doc ([`security-hardening-plan.md`](security-hardening-plan.md), [`testing.md`](testing.md), [`deployment-readiness.md`](deployment-readiness.md)) is updated in the same change.
- A deferred item promoted into §4 needs a stated reason, not a silent move.
- **Never mark a pending item as completed before the code exists.**

Keep all of this in this file. Do not split the queue, the backlog, or the shipped record into a separate document — that split existed before and produced two files claiming the same authority, which is why they were consolidated here.
