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

Existing admin routes are exactly: `/admin`, `/admin/tickets`, `/admin/tickets/[id]`, `/admin/map`, `/admin/barangay-insights`, `/admin/barangay-insights/[barangayId]`, `/admin/flagged`, `/admin/reports`, `/admin/admins`, `/admin/activity-log`, `/admin/account`, `/admin/login`, `/admin/work-orders`.

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

### Work Order Follow-up Improvements — **completed (first increment)**

A small, focused pass on top of the shipped Work Orders feature — due dates and notes went from create-only/display-only to fully editable, plus a new dashboard "Needs Attention" section. No new table, no new route, no crew scheduling/cost tracking/attachments/checklists (explicitly out of scope, see §5).

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

A read-only per-barangay operational drill-down: `/admin/barangay-insights` (all 29 barangays, office-scoped summary counts) and `/admin/barangay-insights/[barangayId]` (profile), sidebar entry in the Main section. See `docs/next-product-roadmap.md` for the planning rationale (this was the "Build Next" item once the roadmap pipeline emptied out).

- `BarangayInsightsController`/`BarangayInsightsService` (`api/src/admin/barangay-insights.*`) — `GET /admin/barangay-insights` and `GET /admin/barangay-insights/:id`, behind `AdminSessionGuard` only, same shape as `ReportsController`: safe because every count is office-scoped via `resolveOfficeScope`, not a guard of its own. Raw-PG (`PG` client), since every query joins `barangays.geom`/`dem_points.geom`.
- **No schema change.** Every aggregate is a `GROUP BY`/`COUNT(*) FILTER` over `tickets`/`reports`/`dem_points`, following the exact office-scoping shape `DashboardService` already uses — the index query moves the office filter into the `tickets` `LEFT JOIN` condition (not a `WHERE`) so all 29 barangays are always returned, even ones with zero tickets for the scoped office.
- Index columns: Total/Active/Resolved/High-Urgency ticket counts, most common category, last activity date. Profile adds: KPI tiles, an all-time category breakdown, a fixed 30-day incident trend (no range selector — this is a barangay profile, not a second dashboard), a `dem_points`-derived elevation min/avg/max (**display only, never a filter**), and the 10 most recent tickets, each linking to `/admin/tickets/{id}` and to `/admin/tickets?barangayId={id}` for the full filtered queue.
- Never selects `work_orders.notes` (this feature never touches `work_orders` at all).
- **Out of MVP, not built**: editing/creating/deleting barangays, CSV export, elevation *filtering*, crew scheduling, due-date calendars, inspection logs, attachments/checklists — see `docs/next-product-roadmap.md` §4 for the full deferred list and reasons.

### Citizen Resolution Feedback / Dispute Loop — **completed**

Closes the one-way finality gap where a citizen had no way to say a `Resolved` ticket wasn't actually fixed. A citizen can "Confirm Fixed" or "Report Still Not Fixed" on a resolved report, both persisted; the latter notifies the assigned office and surfaces on the existing Ticket Queue/Ticket Detail — no new sidebar item, no new admin page.

- `tickets.disputed_at`/`tickets.dispute_reason` (`api/drizzle/0022_ticket_disputes.sql`) — nullable columns, not a status value. `disputed_at` NULL means "not disputed" (single-outstanding-dispute gate). `tickets.resolution_confirmed_at` (`api/drizzle/0023_ticket_resolution_confirmation.sql`) is the positive-path mirror, same gate shape. See `docs/database.md`'s `tickets` entry.
- `POST /reports/mine/:id/dispute` (`ReportsController`/`ReportsService.disputeReport`) — citizen-session-gated, ownership+existence checked in one clause (`WHERE r.id = ... AND r.citizen_id = ...`, joined to the ticket), only allowed when `status = 'Resolved'`, race-safe duplicate rejection via `WHERE disputed_at IS NULL` on the UPDATE (same pattern as `moderation.service.ts`). Creates an office-targeted `ticket_disputed` notification linking to `/admin/tickets/:id`, inside the same transaction as the UPDATE.
- `POST /reports/mine/:id/confirm-resolution` (`ReportsController`/`ReportsService.confirmResolution`) — same ownership/resolved-only/race-safe-UPDATE pattern as the dispute endpoint; rejects if the ticket is already disputed or already confirmed. No notification (a confirmation isn't actionable by an office) and no admin-side surfacing, kept deliberately minimal.
- Admin Ticket Queue gets a "Disputed only" toggle (same shape as Work Orders' "Overdue only") and a "Disputed" badge on each row/card; Ticket Detail shows the disputed date and the citizen's reason. Office scoping is unchanged — the disputed filter rides the same `filters.office` clause every other filter already goes through.
- Never touches `urgency_score`/`priority_score`/`priority_index`/`urgency_band`/`status`/duplicate-detection/work-order logic — a workflow signal layered on top of `Resolved`, not a scoring input or a status rollback.

### "My Assignments" Work Order Filter — **completed**

A personal quick filter on the existing `/admin/work-orders` list — no new page, no new sidebar item, matching §5's rule against inventing a separate route for what's really a filter (the earlier "My Work" recommendation was explicitly scoped this way).

- `WorkOrdersService.parseQuery` now accepts `assignedAdminId=me` as a viewer-relative sentinel, resolved server-side from the caller's own session (`admin.adminId`) — never a client-supplied numeric id, so it can't be used to probe another admin's assignments by id. Works identically for MEO/MDRRMO officers, supervisors, and system admins (every `AdminSession` carries its own `adminId`). Raw numeric `assignedAdminId` values are unaffected. This is the one existing filter path (`list`/`getWorkOrdersForExport`, and the CSV export that reuses `parseQuery`) — no parallel logic was added.
- `WorkOrdersWorkspace.tsx` gets a "My Assignments" toggle button (same shape as the existing "Overdue only" toggle) plus an active-filter badge when enabled; the URL carries `?assignedAdminId=me` literally (not a resolved numeric id), so the link means "my assignments" for whoever opens it. Combines with office/status/overdue rather than replacing them.
- Office scoping is unchanged — `resolveOfficeScope` still runs first in `parseQuery`, so an MEO/MDRRMO admin's "My Assignments" is still clamped to their own office.
- No schema change, no migration, no new endpoint.

---

## 3. Next Product Features

In priority order.

### 3.1 Production Hardening / Deployment Readiness

Last on this list because it's continuous, not a single feature: monitoring/alerting, backup verification, load/perf validation, secrets rotation, deployment runbook. Revisit and expand this item as the system approaches real deployment, rather than treating it as a one-time checkbox.

- **Cron scheduling — done.** `.github/workflows/cron.yml` calls all five `api/src/cron/*` routes (`recompute-urgency`, `recompute-weather`, `cleanup-password-reset-tokens`, `cleanup-notifications`, `cleanup-rate-limit-events`) daily via `curl`, authenticated the same way `CronSecretGuard` already accepts (`Authorization: Bearer $CRON_SECRET`). Requires two repo-level GitHub Actions configs to actually run: `vars.PORAC_API_BASE_URL` and `secrets.CRON_SECRET` — see that workflow file's header comment.
- **Rate-limit event cleanup — done.** `RateLimitService.cleanupOldEvents()` + `POST /cron/cleanup-rate-limit-events` prunes `rate_limit_events` and `password_reset_rate_limit_events` past a 30-day retention window — see `docs/database.md` for why 30 days is safe (both tables' checks only ever look back 24 hours at most).
- **Setup/deployment documentation — done.** `README.md`'s env var setup section previously named variables that don't exist in this codebase (`OPENWEATHER_API_KEY`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`) and never mentioned `api/.env` as a separate file at all — a fresh clone following it literally could not start the API. Rewritten to explain the two-env-file split accurately (with tables of what's actually required vs. optional on each side, matching `api/src/config/env.ts`'s Zod schema) and to add a new "Scheduled Jobs & Deployment" section documenting the `CRON_SECRET`/`PORAC_API_BASE_URL` GitHub Actions requirements and stating plainly that no hosting platform is decided yet.
- **Still not done**: monitoring/alerting, backup verification, load/perf validation, credential rotation (deliberately gated on an actual deploy decision — see `PLAN.md` §0), and a written deployment runbook (no hosting platform is committed anywhere in this repo yet).

---

## 4. Deferred Enhancements

Not next, not blocked — just not prioritized yet. Revisit if a real requirement surfaces:

- Bulk work-order operations and notification tuning beyond what §2's Work Order Follow-up Improvements increment shipped
- Cross-office reporting rollups beyond the MEO/MDRRMO office filter, scheduled/recurring reports, and PDF generation — beyond §2's Reporting and Export Tools' `/admin/reports` page and print-summary scope
- Citizen-facing work-order status summaries (a *rollup*, e.g. "work in progress," never the underlying work order or its notes — see §5)
- A low-elevation/hazard-prone map preset or filter — no elevation-based map filter exists yet (§2's Map Presets); revisit alongside a real elevation-filter feature
- Export audit logging — evaluated in §2's Reporting and Export Tools and skipped; revisit only if a real "who exported what" compliance need surfaces

---

## 5. Do Not Build Yet

- Anything from §4, or later items in §3, ahead of earlier §3 items — the order in §3 reflects real dependencies, not preference.
- **Sidebar or Quick Action entries for routes that do not exist.** Every nav item must resolve to a real page with a real backing endpoint — ship the nav entry with the route, never ahead of it. Office Performance Summary, the Admin Directory/Assigned Admin Picker, and Map Presets (§2) are all the model: real backend + UI, no sidebar item, because none needed its own route.
- Any citizen-facing surface for work orders or internal notes — not even a rollup, until §4 is explicitly picked up and scoped.
- A standalone internal-notes or due-dates feature — both stay inside Work Orders (§2).
- A separate route/sidebar item for Office Performance Summary, the Admin Directory, or Map Presets — all are dashboard/existing-surface features by design; only add a dedicated route if a real, separately-scoped need for one shows up.

---

## 6. Risks to Avoid

- **Weakening RBAC.** Client-side hiding (sidebar, quick actions) is cosmetic. The gate is `AdminSessionGuard` / `SystemAdminGuard` plus `resolveOfficeScope` / `assertOfficeAccess`. A new endpoint — including `AdminDirectoryController` — that forgets the scope helpers is an office-data leak, not a UI bug. The admin map follows the same rule: URL-syncing `?office=` (§2) is a UX convenience, not the security boundary — `TicketsController.geo` re-derives office from the session independently of whatever the client sends.
- **Fake navigation links.** Links to nonexistent routes, or to filtered views the target page can't actually apply, make the system look finished where it isn't — the exact failure Map Presets (§2) was ordered behind URL-synced filters to prevent.
- **Exposing internal work orders or notes to citizens.** `notes` and every other work-order field are staff-only by design; a rollup summary (§4) is the only citizen-facing form ever worth considering, and only once explicitly scoped.
- **Schema drift.** Any new table/column requires a matching `docs/database.md` entry in the same change.
- **Severity vs. Urgency vs. Priority.** Three distinct concepts with distinct data sources — see the terminology section in `CLAUDE.md` before labeling anything in a new UI.
- **Scope creep.** Ship the fields/behavior actually specified for the current item. Attachments, checklists, cost tracking, and crew scheduling are not in scope for Work Orders or its near-term follow-ups unless a §3 item says otherwise.
