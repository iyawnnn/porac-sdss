# MVP Roadmap

**Purpose.** This file is the priority source of truth for *what to build next* in Porac SDSS. Read it before proposing or starting a feature. `PLAN.md` stays the architecture/decision record (why things are built the way they are); this file only answers "what's next, what's deferred, what must not be built yet."

**Maintenance rule.** Update this file in the same change whenever a planned feature is completed, skipped, or reprioritized. A roadmap that lags the code is worse than none — the next session will trust it.

---

## 1. Already completed

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

## 2. Implemented: Office Work Orders / Office Tasks

**Shipped.** `work_orders` table (`api/src/db/schema.ts`, `api/drizzle/0021_work_orders.sql`, run via `pnpm --prefix api migrate:work-orders`) — linked ticket, title, internal `notes`, `assigned_office` (inherited from the ticket at creation time), optional `assigned_admin_id`, its own `pending`/`in_progress`/`completed`/`cancelled` status (independent of `ticket_status` — no coupling exists, per the original design decision below), nullable `due_date`, and created/updated/completed timestamps.

- `WorkOrdersController`/`WorkOrdersService` (`api/src/admin/work-orders.*`) expose list/get/create/update/status endpoints, all behind `AdminSessionGuard`. List uses `resolveOfficeScope` (silent clamp); single-resource reads/writes use `assertOfficeAccess` (hard reject) against the work order's own `assigned_office` — no inline scoping logic.
- Sidebar item ("Work Orders", under Management) added with the route. `/admin/work-orders` (list, filterable by status/office/overdue) and a Work Orders panel on `app/admin/tickets/[id]/page.tsx` (create + status update, scoped to that ticket).
- `notes` and every other work-order field are absent from every `api/src/citizens/*` response and the citizen tracking timeline — no citizen-facing surface exists.
- Audit events (`work_order_created/updated/status_changed/completed/cancelled`) log field names on update, never note bodies.
- **Known limitation:** the "assigned admin" picker is not exposed in the create/edit UI (`assigned_admin_id` is schema/API-complete but unused by the forms) — populating it would need an office-scoped admin-directory endpoint that doesn't exist yet (`GET /admin/admins` is System-Administrator-only). Work orders are effectively office-wide-assigned in this pass; add the picker + endpoint together if per-admin assignment becomes a real requirement.

---

## 3. Folded into Work Orders — not separate features

**Internal notes** and **due dates** were considered as standalone features. They are not. Both live inside Work Orders:

- **Notes** are the office progress trail on a work order. A separate "notes" feature would duplicate this table with no additional value.
- **Due dates** drive the pending / in-progress / overdue workflow. "Overdue" is *derived* (`due_date < now()` and status not completed), not a stored fourth status — storing it would need a job to keep it true.

Do not build either as its own page, table, or sidebar entry.

---

## 4. Next: Office Performance Summary

Work Orders (§2) now exists, so this is unblocked — but still not built. Add once work orders have accumulated real data (an empty-table dashboard is a dead page).

- Counts for: pending, in progress, completed, overdue, high-urgency, flagged
- Scoped to the caller's office via `resolveOfficeScope`; city-wide only for `system_admin`
- Likely reuses the dashboard's existing card/chart components rather than new ones

---

## 5. Deferred: Office-specific map filters / layers

**Blocked.** `MapFilterState` in `components/features/admin/map/MapFilterBar.tsx` is client React state only — the map reads just `?office=` from the URL. Until map filters sync to URL/query params, an "MEO drainage view" link cannot actually apply a filter.

Order of work when unblocked:
1. Sync `MapFilterState` to URL query params (the Ticket Queue already works this way — follow that pattern).
2. Then add office presets: **MEO** — drainage, road damage, illegal dumping, infrastructure. **MDRRMO** — flood/hazard reports, high urgency, low-elevation areas.

Do not add map shortcut links before step 1. A link that lands on an unfiltered map is a fake navigation link.

---

## 6. Final demo / documentation polish

Last, after the features above:
- Demo script (walkthrough order, accounts, seeded data)
- README / `docs/` updates to match shipped state
- Test and demo-data cleanup (`e2e/`, `seed:diverse-reports` — note it `TRUNCATE`s tickets)

---

## 7. Do not build yet

- Anything from §4–§6 ahead of §2.
- A standalone internal-notes or due-dates feature (§3).
- Map shortcut links or office layers before URL-synced map filters (§5).
- **Sidebar or Quick Action entries for routes that do not exist.** Every nav item must resolve to a real page with a real backing endpoint.
- Any citizen-facing surface for work orders or internal notes.

---

## 8. Risks to avoid

- **Weakening RBAC.** Client-side hiding (sidebar, quick actions) is cosmetic. The gate is `AdminSessionGuard` / `SystemAdminGuard` plus `resolveOfficeScope` / `assertOfficeAccess`. A new endpoint that forgets the scope helpers is an office-data leak, not a UI bug.
- **Fake navigation links.** Links to nonexistent routes, or to filtered views the target page can't actually apply, make the system look finished where it isn't — the exact failure §5 is deferred to prevent.
- **Schema drift.** Any new table/column requires a matching `docs/database.md` entry in the same change.
- **Severity vs. Urgency vs. Priority.** Three distinct concepts with distinct data sources — see the terminology section in `CLAUDE.md` before labeling anything in a new UI.
- **Scope creep on Work Orders.** Ship the fields in §2. Attachments, checklists, cost tracking, and crew scheduling are not MVP.
