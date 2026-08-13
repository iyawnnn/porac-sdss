# Features

**What PORAC-SDSS currently does.** This document describes behavior that exists in the codebase today, with a source or test citation for each flow so it can be checked rather than trusted.

For a role-by-role narrative of how each user type works through the system — citizen, MEO, MDRRMO, System Administrator, plus an end-to-end scenario — see [`user-flows.md`](user-flows.md). This file is the inventory; that one is the walkthrough.

It deliberately does not cover: **setup and environment** (see [`README.md`](../README.md) §C–§E), **table/column detail** (see [`database.md`](database.md)), **why things are built the way they are** (see [`CLAUDE.md`](../CLAUDE.md)'s Architecture section and [`PLAN.md`](../PLAN.md), which is a historical record), or **what shipped when and what is queued** (see [`project-status.md`](project-status.md)). For the security model behind the access rules summarized here, see [`security.md`](security.md).

---

## 1. Audience model

Three principal types, structurally separate:

| Principal | Signs in at | Sees |
|---|---|---|
| **Citizen** | `/login`, `/signup` | Only their own reports, plus a city-wide ticket map |
| **MEO / MDRRMO office admin** (`officer` or `supervisor`) | `/admin/login` | Only their own office's tickets, work orders, and counts |
| **System Administrator** | `/admin/login` | City-wide across both offices, plus admin management and the activity log |

Citizen and admin sessions are independent and cannot cross over — a citizen account can never reach an `/admin/*` API route, and vice versa. There is **no guest/anonymous reporting**; a citizen account is required to submit. See [`security.md`](security.md) §2–§3.

**Office routing is automatic, by category** (`api/src/common/utils/office.ts`):

| MDRRMO | MEO |
|---|---|
| Flooding, Clogged Drain, Fallen Tree | Pothole, Uneven Sidewalk, Streetlight Out, Leaking Pipe, Uncollected Garbage, Illegal Dumping, Overgrown Vegetation, Other |

A System Administrator can reassign a ticket's office afterwards (§4.5).

---

## 2. Citizen features

Routes live under `app/(citizen)/`. All of these except `/login`, `/signup`, `/forgot-password`, and `/reset-password` require a citizen session (`proxy.ts` redirects to `/login`; the API independently rejects with 401).

### 2.1 Account

- **Signup / login** (`/signup`, `/login`) — email + password, bcrypt-hashed.
- **Google OAuth** (`api/src/auth/oauth/`) — optional; disabled entirely if the Google env vars are absent. Covered by `e2e/oauth-buttons.spec.ts`.
- **Forgot / reset password** (`/forgot-password`, `/reset-password`) — emailed token, 30-minute default TTL. The response is identical whether or not the email exists (enumeration resistance).
- **Account & Security** (`/account`) — change password, link/unlink an OAuth provider, and view a personal activity trail. Sensitive actions here require a fresh re-authentication, not just a valid session (see [`security.md`](security.md) §4.3).

### 2.2 Submitting a report

`/report` — `components/features/citizen/report/ReportForm.tsx`. Covered end to end by `e2e/smoke.spec.ts`.

The form walks the citizen through:

1. **Photo upload first.** The map and barangay picker stay disabled until a photo is attached — location is anchored to evidence, not typed in freehand.
2. **EXIF GPS extraction** in the browser. Three outcomes, all surfaced in the UI:
   - GPS found and inside the municipality → *"GPS Metadata Verified (EXIF Found)"*, location pre-filled.
   - No GPS in the photo → prompt to place the pin manually.
   - GPS outside Porac's bounds → *"Photo GPS location is outside Porac municipality bounds."*
3. **Map pin + barangay search.** Placing a pin more than 100m from the photo's GPS warns that the submission will be flagged for review — it is not blocked.
4. **Category** (11 options) and **citizen severity** (Low / Medium / High / Critical — the citizen's own subjective read, never computed; see §6.1).

On submit, the server independently recomputes everything it will not trust from the client: barangay (§5.1), elevation from the DEM (§5.4), and the integrity flags (§5.5). Elevation is **never** accepted from client input.

### 2.3 Tracking a report

- **My Reports** (`/reports`) — list with category, barangay, status, and assigned office; a real empty state with a "Report Hazard" call to action for new accounts.
- **Report detail** (`/dashboard/reports/[id]`) — a timeline of what has happened, starting from "Report submitted", plus the current status.
- **Merge visibility** — when a report is deduplicated into an existing ticket (§5.3), the detail page shows *"Merged with an existing issue"* and *"Grouped with N other report(s)"*. The citizen is told their report joined a group, not that it was discarded.
- **Moderation visibility** — if an admin quarantines a report, the citizen sees a deliberately non-accusatory banner (*"Report under additional review"*) explaining it needs another look before appearing on the map, and that **this does not affect the ticket's progress**.

Covered by `e2e/citizen-reports.spec.ts`.

### 2.4 Case closure and resolution feedback

Once the ticket reaches `Resolved`, the report detail page shows two distinct cards:

- **Case Closure Summary** (read-only) — resolved date, the staff's completion notes, the staff's resolution photo, and a one-line recap of the citizen's own feedback once given.
- **Resolution Feedback** (action) — **Confirm Fixed** or **Report Still Not Fixed**.
  - *Confirm Fixed* persists (`resolution_confirmed_at`) and survives reload. No office notification — a confirmation isn't actionable.
  - *Report Still Not Fixed* asks "What's still wrong?", persists the reason, notifies the assigned office, and surfaces on the admin Ticket Queue and Ticket Detail.

A dispute never rolls the ticket status backwards and never feeds any score. Only one outstanding dispute per ticket. The citizen's own dispute *reason* is admin-facing; the citizen sees only their feedback state. Covered by `e2e/citizen-dispute.spec.ts`.

### 2.5 Map and notifications

- **Citizen map** (`/map`) — city-wide ticket pins with the municipal boundary overlay. Requires a citizen session (it is city-wide, not anonymous-public).
- **Notifications** — a bell with click-through to the relevant report. Citizen-facing types include `report_received`, `report_merged`, `report_quarantined`, `report_flagged_duplicate`, and the status-progression types (`ticket_under_review`, `ticket_in_progress`, `ticket_resolved`).

---

## 3. Admin features — shared surfaces

Routes live under `app/admin/`. All are gated by `AdminSessionGuard` on the API side; `proxy.ts` additionally redirects unauthenticated page loads to `/admin/login`.

The sidebar has exactly eight entries (asserted in `e2e/citizen-dispute.spec.ts`): Dashboard, Ticket Queue, Interactive Map, Barangay Insights, Work Orders, Flagged Reports, Reports & Exports, Notifications. Admin Management and Activity Log appear for System Administrators only. **Every nav entry resolves to a real route** — this is an explicit project rule, not a coincidence.

### 3.1 Dashboard (`/admin`)

Assembled from a single `GET /admin/dashboard` call:

- KPIs and a date-range control, incident-over-time chart, status/category distributions, barangay and category rankings.
- **Office Performance Summary** — Pending / In Progress / Overdue / Completed-this-week work orders, high-urgency open tickets, and flagged reports pending review. System Administrators additionally get a MEO vs. MDRRMO comparison.
- **Needs Attention** — three short lists: overdue work orders, work orders due today, and active HIGH-urgency tickets that still have unfinished work.
- **Map Presets** — office-appropriate links into a genuinely pre-filtered `/admin/map`.
- Role-aware Quick Actions.

Everything here is office-scoped server-side. Covered by `e2e/admin-dashboard.spec.ts`, `e2e/admin-dashboard-performance-summary.spec.ts`.

### 3.2 Ticket Queue (`/admin/tickets`)

The primary triage surface, sorted by urgency by default.

- **Filters, all URL-synced:** status, urgency, category, barangay, free-text search (ticket ID, title, or barangay), a "Disputed only" toggle, and — for System Administrators only — an office picker. A "Reset filters" control appears when any are active.
- **Sorting and pagination**, both reflected in the URL.
- **Responsive:** a desktop table and a mobile card list below `md`.
- **CSV export** honoring the currently applied filters.

Covered by `e2e/admin-tickets.spec.ts` (~21 tests).

### 3.3 Ticket Detail (`/admin/tickets/[id]`)

- **Header** — ticket ID, assigned office, status pill, urgency badge.
- **Status tracker** — a single "Advance to *next*" control walking `Reported → Under Review → In Progress → Resolved`. The final step opens a **resolve dialog** requiring completion notes and accepting a resolution photo; once set, a "Before & after resolution" card renders. There is no further transition after `Resolved`.
- **Assignment panel** — reassign to the other office, audited. Available to **any admin who can access the ticket**, not System Administrators only: the endpoint uses `assertOfficeAccess` against the ticket's *current* office, and `AssignmentPanel.tsx` carries no role gate. For an office admin this is a one-way hand-off — after reassigning, the ticket belongs to the other office and they can no longer open it. System Administrators can move a ticket in either direction.
- **Urgency decomposition** — the three factors with their explicit ⅓ weights and per-factor contributions, not just a final number.
- **Priority breakdown** — the separate workflow-priority formula (§6.1).
- **Evidence & reports** — every merged citizen report with its photo, and its integrity flags.
- **Location** — map, barangay, coordinates, elevation.
- **Work Orders panel** — create and manage work orders inline (§3.4).
- **Dispute section** — renders only when disputed, showing the date and the citizen's reason.

### 3.4 Work Orders (`/admin/work-orders` and the Ticket Detail panel)

The record of actual field work. **A fourth, independent status track** — `pending / in_progress / completed / cancelled` — deliberately *not* coupled to `tickets.status`: completing every work order does not advance the ticket, and advancing the ticket does not touch its work orders.

- Title, internal progress **notes**, assigned office (inherited from the ticket), optional assigned admin, optional due date.
- **Assignee picker** scoped to the work order's own office; validated server-side (target must exist, be active, and belong to that office).
- **Due dates** — editable inline, with derived `overdue` / `due today` states. "Overdue" is computed from `due_date` and status, never stored.
- **"My Assignments"** — a personal filter resolved server-side from the caller's own session, so it can't be used to probe another admin's workload.
- Filters for status, office, overdue, and assignee; CSV export excludes `notes` at the query level.

**`notes` is staff-only and never appears in any citizen-facing response** — enforced and regression-tested (`e2e/admin-work-orders.spec.ts` submits a sentinel note and asserts it never renders on the citizen page). ~30 tests.

### 3.5 Flagged Reports (`/admin/flagged`)

Moderation queue for integrity-flagged submissions (§5.5). Three actions: **dismiss**, **quarantine**, **mark duplicate**. Quarantine surfaces to the citizen through the neutral banner described in §2.3. Covered by `e2e/admin-flagged.spec.ts`.

### 3.6 Barangay Insights (`/admin/barangay-insights`)

Read-only per-barangay drill-down across all 29 Porac barangays.

- **Index** — total / active / resolved / high-urgency ticket counts, most common category, last activity. All 29 barangays always render, including those with zero tickets for the scoped office.
- **Profile** — KPI tiles, all-time category breakdown, a fixed 30-day incident trend, a DEM-derived elevation min/avg/max (**display only, never a filter**), and the 10 most recent tickets, each deep-linking into the filtered Ticket Queue.

No editing, creating, or exporting — deliberately. Covered by `e2e/admin-barangay-insights.spec.ts`.

### 3.7 Interactive Map (`/admin/map`)

Leaflet map with ticket pins, a barangay choropleth, and a heatmap layer driven by the priority index. Category / urgency / status / barangay / search filters plus the pins-vs-heatmap toggle are all URL-synced, so a filtered view is a shareable link. Covered by `e2e/admin-map.spec.ts` (~16 tests).

### 3.8 Notification Center (`/admin/notifications`)

Full history behind the bell, with cursor pagination and read/unread plus type filters. Available to all three roles; each admin sees only their own and their office's rows. Admin-facing types include `new_citizen_report`, `ticket_critical`, `ticket_disputed`, `ticket_escalation`, `work_order_created`, and `work_order_assigned`.

### 3.9 Reports & Exports (`/admin/reports`)

A shared office/date-range filter panel driving both the ticket and work-order CSV exports, plus a printable operational summary (`window.print()` with a print stylesheet; no PDF library). Exports reuse the list endpoints' own filter parsing, so an export can never return more than the equivalent list view already allows.

### 3.10 System Administrator only

- **Admin Management** (`/admin/admins`) — create, edit role/office, deactivate and reactivate admin accounts. A lockout guard prevents deactivating the last active System Administrator.
- **Activity Log** (`/admin/activity-log`) — the `admin_audit_events` trail, filterable by target type. See [`security.md`](security.md) §6.
- **Own account** (`/admin/account`) — password management.

---

## 4. Spatial decision support

The research core. This section is the operational summary; **[`triage-model.md`](triage-model.md) is the authoritative reference** for the exact formulas, weights, thresholds, banding discrepancies, and known limitations.

### 4.1 Barangay resolution

Two-stage, because address-accuracy failures are the expensive kind:

1. Strict `ST_Contains` against the PSGC/OCHA barangay polygons.
2. On a miss, check the independent OSM municipal outer boundary. If the point is inside the municipality but outside every barangay polygon, **snap to the nearest barangay** and flag `BOUNDARY_FALLBACK` rather than rejecting a legitimate report.
3. Outside even the municipal boundary → rejected as outside city limits.

Barangay *identity* always comes from the PSGC table; OSM is only the accept/reject envelope.

### 4.2 Spatial validation

Coordinates are bounds-checked against the municipality before anything else. The report form surfaces this client-side, and the API re-validates independently.

### 4.3 Duplicate detection and merging

A new report merges into an existing ticket when it falls within a **category-specific radius** (`api/src/common/utils/radius.ts`) of an active ticket **created within the last 7 days**. The window is anchored to the ticket's original creation and does not slide on merge.

Merging increments `member_count` and recomputes the ticket centroid — which is why urgency is scored on **tickets**, not reports. The merge transaction takes a `pg_advisory_xact_lock` keyed on `(category, barangay_id)`.

### 4.4 Urgency scoring

```
urgency_score = ⅓ × elevationFactor + ⅓ × precipitationFactor + ⅓ × clusterFactor
```

banded **Low / Medium / Critical** at 0.4 / 0.7.

- **Elevation** — inverse-normalized against city-wide min/max computed once at DEM seed time. Lower ground scores higher.
- **Precipitation** — real `rain["1h"]` millimetres from OpenWeatherMap, capped at the PAGASA 30mm/h torrential threshold, cached ~10 minutes in the database so it survives restarts.
- **Cluster** — report density around the ticket.

Recomputed on demand when an admin loads the dashboard, ticket list, ticket detail, or map, and again daily as a safety net by the cron workflow.

### 4.5 Integrity flags

Flags **never block a submission**. They append to `reports.flags[]` and route to `/admin/flagged` for a human decision — decision support, not a gatekeeper.

| Flag | Meaning |
|---|---|
| `NO_EXIF` | Photo carried no GPS metadata |
| `STALE_PHOTO` | Photo timestamp is old relative to submission |
| `LOCATION_MISMATCH` | Pin placed far from the photo's EXIF GPS |
| `DUPLICATE_IMAGE` | Perceptual-hash match against a recent report |
| `BOUNDARY_FALLBACK` | Snapped to nearest barangay via the OSM envelope (§4.1) |

### 4.6 Scheduled jobs

Six cron routes (`api/src/cron/`), all behind a shared secret, run daily via GitHub Actions: urgency recompute, weather recompute, three cleanup jobs (expired reset tokens, old read notifications, old rate-limit events), and a **ticket escalation check** that flags active tickets older than 7 days with no work order that ever reached `in_progress` or `completed`. Escalation notifies the office once per ticket, using the existence of the prior notification row rather than a new schema column.

---

## 5. Cross-cutting notes

### 5.1 Severity vs. Urgency vs. Priority

Four distinct concepts that are easy to conflate. The authoritative definitions are in [`CLAUDE.md`](../CLAUDE.md); in short:

| Term | Source | Meaning |
|---|---|---|
| **Severity** | Citizen input | Subjective Low/Medium/High/Critical on a report. Never computed. |
| **Urgency** | Computed | The environmental hazard score (§4.4). `priority_score` and `urgency_level` are the *same* value rescaled 0–100 and re-banded — an urgency representation, labeled "Urgency" in the UI despite the column name. |
| **Priority** | Computed, different formula | `priority_index` — citizen severity + ticket age + barangay density. Workflow urgency (how soon staff should act), not environmental hazard. Powers the Priority breakdown card and the map heatmap. |
| **Dispute** | Citizen action | A workflow signal on a resolved ticket. Not a score, not a status. |

**Known discrepancy, not a bug:** `urgency_band` (thresholds 0.4/0.7) and `urgency_level` (thresholds 0.5/0.8) can disagree at the boundary — a ticket at 0.45 is band `Medium` but level `LOW`. Reconciling the two threshold sets is an open decision.

### 5.2 Office scoping

Enforced on the server, every time, from the session — never from a query parameter. A hand-crafted `?office=MDRRMO` from an MEO session returns MEO data. List endpoints **silently clamp**; single-resource reads and writes **hard-reject with 403**. Regression-tested in `e2e/admin-tickets.spec.ts`, `e2e/admin-work-orders.spec.ts`, `e2e/admin-rbac.spec.ts`, and `e2e/admin-barangay-insights.spec.ts`. Details in [`security.md`](security.md) §3.

### 5.3 Citizen / admin separation

Two independent auth systems; two independent sets of API routes. No citizen-facing surface exposes work orders, work-order notes, internal moderation notes, or another citizen's reports. This is a standing product rule, not merely current state.

### 5.4 SSR/API resilience

A transient Next → NestJS connection failure during server rendering (e.g. an API restart) no longer replaces the whole admin or citizen app with the framework's default error screen. `app/error.tsx` catches the failure at the root, above both the admin and citizen layouts; `app/admin/error.tsx` gives admin pages the same page-level recovery the six citizen `error.tsx` boundaries already had. Both retry via re-fetching rather than a plain reset, so a working "Try Again" click actually recovers the page once the API is back.

---

## 6. Not included / pending

Separated from everything above because none of it is implemented.

**Pending hardening** (see [`project-status.md`](project-status.md) §4):

- Monitoring and alerting — not started.
- Backup verification — not started.
- Load and performance validation — not started.
- Credential rotation — gated on an actual deployment decision.
- Written deployment runbook — no hosting platform is committed anywhere in this repo.

**Deliberately deferred product ideas** — crew scheduling, attachments/checklists, inspection logs, a standalone due-date calendar, barangay editing, elevation *filtering*, CSV export for Barangay Insights, citizen-facing work-order rollups, PDF generation, and scheduled/recurring reports. See [`project-status.md`](project-status.md) §5 for the full list and the reasoning. None of these are queued; each needs a real, separately-scoped requirement before it moves.

---

## 7. Verifying this document

Every flow above is exercised by the Playwright suite — 19 spec files, roughly 200 tests, running against a real dev server and a real database with no mocks. See [`README.md`](../README.md) §I for how to run it, why `--workers=1` is mandatory, and the rate-limit caveat on repeated full runs.
