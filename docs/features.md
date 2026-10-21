# Features

**What PORAC-SDSS currently does.** This document describes behavior that exists in the codebase today, with a source or test citation for each flow so it can be checked rather than trusted.

For a role-by-role narrative of how each user type works through the system — citizen, MEO, MDRRMO, System Administrator, plus an end-to-end scenario — see [`user-flows.md`](user-flows.md). This file is the inventory; that one is the walkthrough.

It deliberately does not cover: **setup and environment** (see [`README.md`](../README.md) §C–§E), **table/column detail** (see [`database.md`](database.md)), **why things are built the way they are** (see [`CLAUDE.md`](../CLAUDE.md)'s Architecture section and [`PLAN.md`](../PLAN.md), which is a historical record), or **what shipped when and what is queued** (see [`project-status.md`](project-status.md)). For the security model behind the access rules summarized here, see [`security.md`](security.md).

---

## 1. Audience model

Four principal types, structurally separate (five-role architecture — Batches 1–5):

| Principal | Signs in at | Sees |
|---|---|---|
| **Citizen** | `/login`, `/signup` | Only their own reports, plus a city-wide ticket map |
| **MEO / MDRRMO office admin** (`officer` or `supervisor`) | `/admin/login` | Only their own office's tickets, work orders, counts, and Operational Assessment |
| **Focal Personnel** (`focal`, always `office: 'MDRRMO'` organizationally) | `/admin/login` | Municipality-wide incoming-report intake (both offices) — never the operational Ticket Queue, Work Orders, or Operational Assessment; see §3.11 |
| **System Administrator / MIS** (`system_admin`) | `/admin/login` | Admin management and the activity log only — **no routine operational access at all**, and no Focal Intake access either |

Citizen and admin sessions are independent and cannot cross over — a citizen account can never reach an `/admin/*` API route, and vice versa. There is **no guest/anonymous reporting**; a citizen account is required to submit. See [`security.md`](security.md) §2–§3 for the guards enforcing this (`OperationalStaffGuard`, `FocalGuard`, `SystemAdminGuard`) — each of the four admin-side roles is denied the other three's surfaces server-side, not merely hidden from navigation.

**Office routing is automatic, by category** (`api/src/common/utils/office.ts`), and every category also carries a **direct responsibility** flag distinguishing "this office owns fixing it" from "this office holds custody for triage, but the real work belongs to an external agency". A Phase 3 follow-up (manuscript alignment) replaced the citizen-selectable category list with a more explicit set, and manuscript revision Phase 2, step 2a adopted the manuscript's names and split the combined drainage category (handoff Decisions 6, 9) — 13 categories; the table below is what a **new** report can be filed as today:

| MDRRMO (direct) | MEO (direct) | MEO custody, Referral |
|---|---|---|
| Localized Flooding, Rain-Induced Slope Failure/Landslide, Lahar or Volcanic Debris-Flow Threat, Fallen Tree or Storm-Related Road Obstruction | Pothole / Road Surface Damage, Uneven Sidewalk, Damaged Manhole Cover, Clogged Drainage / Damaged Culvert, Streetlight Out | Illegal Dumping Affecting Drainage or Road, Overgrown Vegetation Obstructing Road or Signage, Leaking Pipe / Water Supply Concern, Other Minor Infrastructure Hazard |

The names they replaced — `Landslide / Slope Failure`, `Lahar / Debris-Flow Threat`, `Fallen Tree / Storm-Related Obstruction` and the combined `Drainage / Culvert / Manhole Issue` — stay readable legacy values (filters and old links still accept them, routing is unchanged). Migration `0035` renames the first three on existing tickets and saved views; old combined drainage tickets keep their category and are marked **category review required** (an implementation extension, Decision 13), shown as a badge and a Ticket Queue filter until staff correct them in Phase 3.

"Uncollected Garbage" was removed from the new-submission list entirely — routine solid-waste collection is outside direct MEO/MDRRMO responsibility unless it's specifically affecting roads/drainage (the Illegal Dumping category covers that case instead). An unrecognized category string, or one of the 11 pre-follow-up ("legacy") category strings a historical ticket may still carry, lands in MEO custody flagged Referral, rather than being silently treated as normal MEO work — see [`database.md`](database.md) for the exact legacy → current mapping and which categories stayed direct-responsibility vs. moved to Referral. A Referral-classified ticket's detail page offers a "Log Referral" action recording the external agency/target and a note as an audit-trail entry — **historical documentation, not a live status**; there is no "pending referral" state to query or filter on. A System Administrator (or any admin with access to the ticket) can reassign a ticket's office afterwards regardless of classification (§4.5).

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
4. **Category** (13 options, `CATEGORIES` in `api/src/contracts/schemas.ts`) and **citizen severity** (Low / Medium / High / Critical — the citizen's own subjective read, never computed; see §6.1).

On submit, the server independently recomputes everything it will not trust from the client: the barangay (§4.1) and the integrity flags (§4.5). Reports carry no elevation since manuscript revision Phase 1, step 7a.

Every report gets a **tracking reference**, given in the success message and in the "Report received" notification (Appendix H, manuscript revision Phase 2, step 2b): `PRC-<YYYY>-<report id, at least 6 digits>`, e.g. `PRC-2026-000123`, where YYYY is the submission year in Manila time. The database generates it (an insert trigger, `docs/database.md`), so it is the same reference staff see.

### 2.3 Tracking a report

- **My Reports** (`/reports`) — list with category, barangay, status, assigned office, and each report's tracking reference under its title; a real empty state with a "Report Hazard" call to action for new accounts.
- **Report detail** (`/dashboard/reports/[id]`) — a timeline of what has happened, starting from "Report submitted", plus the current status. The tracking reference sits under the title and in the Citizen Record panel ("Tracking Reference", which showed `#R<id>` before Phase 2, step 2b).
- **Merge visibility** — when a report belongs to a ticket with earlier reports (historical automatic merges; staff-confirmed merges from Phase 3), the detail page shows *"Merged with an existing issue"* and *"Grouped with N other report(s)"*. The citizen is told their report joined a group, not that it was discarded.
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

- **Citizen map** (`/map`) — city-wide ticket pins with the municipal boundary overlay. Requires a citizen session (it is city-wide, not anonymous-public). Shows all active tickets (`Reported`, `Under Review`, `In Progress`) — `Resolved`/`Rejected` tickets are terminal and excluded; this matches the same 3-status "active" definition used by the admin map, dashboards, and every ticket-list query (Phase 5 fixed a prior omission where `Under Review` tickets were briefly invisible on this map). Since manuscript revision Phase 1, step 6d it is a privacy-limited view (manuscript Appendix L): other citizens' reports show only status, category, barangay, an approximate location (coordinates rounded server-side to 3 decimals, about 100 m), reported date, last update, handling office and a fixed per-status public update — never the reporter's title, photo, identity or exact pin. A citizen's own report links through to its full detail page.
- **Notifications** — a bell with click-through to the relevant report. Citizen-facing types include `report_received`, `report_merged` (historical only — no longer created since Phase 1, step 3), `report_quarantined`, `report_flagged_duplicate`, and the status-progression types (`ticket_under_review`, `ticket_in_progress`, `ticket_resolved`).

---

## 3. Admin features — shared surfaces

Routes live under `app/admin/`. All are gated by `AdminSessionGuard` on the API side; `proxy.ts` additionally redirects unauthenticated page loads to `/admin/login`.

The sidebar has exactly eight entries (asserted in `e2e/citizen-dispute.spec.ts`): Dashboard, Ticket Queue, Interactive Map, Barangay Insights, Work Orders, Flagged Reports, Reports & Exports, Notifications. Admin Management and Activity Log appear for System Administrators only. **Every nav entry resolves to a real route** — this is an explicit project rule, not a coincidence.

### 3.1 Dashboard (`/admin`)

Assembled from a single `GET /admin/dashboard` call:

- KPIs and a date-range control, incident-over-time chart, status/category distributions, barangay and category rankings.
- **Office Performance Summary** — Pending / In Progress / Overdue / Completed-this-week work orders and flagged reports pending review. System Administrators additionally get a MEO vs. MDRRMO comparison. (The high-urgency open-tickets count was removed in manuscript revision Phase 1, step 6a, with no replacement.)
- **Needs Attention** — three rows: overdue work orders, work orders due today, and flagged reports pending. (The "High-Urgency Open Work" row was removed in manuscript revision Phase 1, step 6a.)
- **Map Presets** — office-appropriate links into a genuinely pre-filtered `/admin/map`.
- Role-aware Quick Actions.

Everything here is office-scoped server-side. Covered by `e2e/admin-dashboard.spec.ts`, `e2e/admin-dashboard-performance-summary.spec.ts`.

### 3.2 Ticket Queue (`/admin/tickets`)

The primary triage surface, sorted by Operational Priority (`priority_index`) descending by default (Batch 4: five-role production alignment) — the administrative queue recommendation (the retired Hazard Urgency score is no longer computed). Rebuilt to the "Precision Queue" design (`docs/design-system.md` §5.8) so an admin can act on a batch of tickets without opening each one.

- **View tabs with live counts:** built-in presets — All active, Disputed, and (system-admin scope only) MEO and MDRRMO — each carrying a server-computed count (`TicketsService.getViewCounts`, returned alongside the list on `GET /admin/tickets`). Counts are office-scoped to the caller, so an office admin sees no MEO/MDRRMO split at all. A tab underlines only when the filter state is *exactly* what it sets; an ad-hoc combination underlines nothing.
- **Saved views:** "Save this view" stores the current filters, sort and page size as a personal tab (`admin_saved_views`, max 12 per admin). Private to the admin who saved it, never office-wide, and re-parsed through `parseTicketQuery` on use — a stored `office=` can never widen scope. Saved views carry no count.
- **Filters, all URL-synced,** collapsed behind a `Filters` popover carrying an active count, with each active filter also shown as a dismissable chip: status, category, barangay, a "Disputed only" toggle, a "Needs category review" toggle (`categoryReview=true` — old combined drainage tickets marked by migration `0035`; the CSV export honors it too), and — for System Administrators only — an office picker. Free-text search (ticket ID, title, or barangay) stays a standalone box. "Clear all" resets them.
- **Sorting and pagination**, both reflected in the URL. Sort offers Operational Priority (high/low, the default) and Newest first (§5.1). The Hazard Urgency sorts (`priority_desc`/`priority_asc`), the urgency filter and the "High urgency" tab were retired in manuscript revision Phase 1, step 4; an old bookmark carrying them opens the default queue, and stored saved views were rewritten by migration `0034`.
- **Row badges:** "Disputed" on a citizen-disputed ticket and "Category review" on a ticket marked `category_review_required` (desktop grid rows).
- **Operational Priority columns:** "Op. Priority" shows `priority_index` (1–100) and "Level" its display band — Low 1–33, Medium 34–66, High 67–100, from `lib/utils/ui/priority.ts`. That band is a UI convention for Operational Priority only (not a manuscript threshold, never `urgency_level`); the KPI row's "High priority" and "Avg. priority" tiles use the same values.
- **Row selection and bulk actions:** select rows individually or the whole page, then Assign office, Advance status, Create work orders, or Export selection. Bulk work **loops the single-ticket service methods**, so each ticket gets the same office check, `status_history` row, `admin_audit_events` entry and citizen notification a single action would write. Partial success is normal and always reported per ticket — most importantly, a ticket whose next status is `Resolved` is **skipped**, because resolving requires a proof photo only the Ticket Detail page can collect. Capped at 50 ids (the largest page size).
- **Inline status advance:** the status pill's chevron offers the single legal next status (`NEXT_STATUS`), not a free choice of all five. The Resolved step links to Ticket Detail instead of firing.
- **Keyboard navigation:** `J`/`K` move the row focus, `X` selects, `Enter` opens. Suppressed while typing in any field.
- **Column visibility and row density** toggles in the toolbar. The queue's ten columns are fixed-width tracks, so the table scrolls inside its own card rather than squeezing; hiding columns is the way to fit a narrow screen.
- **Responsive:** the grid table above `md`, a stacked row list below it.
- **CSV export** honoring the currently applied filters (columns: Ticket ID, Status, Assigned Office, Operational Priority, Category, Barangay, Report Count, Created At, Updated At — no Hazard Urgency column since Phase 1, step 4), plus an `ids` export-only parameter used by "Export selection" (parsed in `ReportsService`, never added to the list endpoint's query shape).

Covered by `e2e/admin-tickets.spec.ts` (~21 tests) and `api/src/admin/tickets-queue.service.spec.ts` (view-count office scoping and bulk eligibility/delegation).

### 3.3 Ticket Detail (`/admin/tickets/[id]`)

- **Header** — ticket ID, assigned office (followed by "Initially routed to {office}" when the ticket has since been reassigned away from the office automatic Initial Routing chose — `initial_assigned_office`, Appendix H), status pill, an "Outcome: Municipal action completed" badge on a Resolved ticket (`resolution_outcome`, Appendix H — set when the ticket is resolved through the status tracker; an External referral outcome can only be recorded from Phase 5), Operational Priority badge (`priority_index` with its Low/Medium/High display band; Hazard Urgency until manuscript revision Phase 1, step 5), and an amber "Category review needed" badge on an old combined drainage ticket (`category_review_required`; the correction itself arrives in Phase 3).
- **Status tracker** — a single "Advance to *next*" control walking `Reported → Under Review → In Progress → Resolved`. The final step opens a **resolve dialog** requiring completion notes and accepting a resolution photo; once set, a "Before & after resolution" card renders. There is no further transition after `Resolved` through this control.
- **Reject action** (Phase 4 workflow completeness) — a separate "Reject" panel, visible only while the ticket is `Reported`, `Under Review`, or `In Progress`, offered alongside the status tracker rather than as a step within it — rejection is an alternative terminal outcome, not the next rung of the ladder. Requires a reason (same required/trimmed/length-bounded validation as a citizen dispute reason); the reason is recorded in the `ticket_rejected` `admin_audit_events` row's metadata, **not** a new ticket column. Sets `status = 'Rejected'`, writes `status_history`, notifies the citizen in-app and by email (reason included in both) where an email provider is configured, and — once rejected — permanently hides the reject action and shows "This ticket was rejected." in the status tracker. `Resolved` and `Rejected` tickets cannot be rejected again (already terminal). See `docs/database.md`'s `admin_audit_events` section for exactly where the reason lives.
- **Assignment panel** — reassign to the other office, audited. Available to any **office admin who can access the ticket** (`officer`/`supervisor` of the ticket's current office; `assertOfficeAccess` re-derives that office fresh on every call) — System Administrators cannot reach Ticket Detail at all (Batch 1 removed `system_admin`'s operational access entirely; `OperationalStaffGuard` denies it before this page's own API calls even run). Focal Personnel can also trigger the *same* `reassignOffice` call, but only through the separate Focal Intake Forward action (§3.11) and only under a narrower rule (`Reported` status, no active Work Order) — never from this panel, which Focal cannot reach either.
- **Operational Priority card** ("System generated", Scoring tab) — the workflow-priority formula (§6.1) with its factor table (severity / age / barangay density) while the ticket is active; a Resolved or Rejected ticket shows its last stored value only. Labeled "Operational Priority", never bare "Priority", to stay distinct from the Operational Assessment card below. The Hazard Urgency card (three environmental factors and the live rain rate) was removed in manuscript revision Phase 1, step 5.
- **Operational Assessment card** ("Human assessment", five-role Batch 3) — the third decision-support layer, structurally distinct from the two above: MEO/MDRRMO's own office can add/edit one current assessment per ticket (observed conditions, safety implications, operational constraints, recommended action, temporary mitigation, optional deferment/referral reason, optional remarks). Authorization follows *current* ticket ownership, so a ticket reassigned to the other office transfers edit rights with it while preserving who originally created the assessment. There is no score, level, or band anywhere in this card — saving it never changes `tickets.status`.
- **Evidence & reports** — every merged citizen report with its photo, its tracking reference (`PRC-…`, the one the citizen has), and its integrity flags.
- **Location** — map, barangay, coordinates (the elevation line was removed in manuscript revision Phase 1, step 7a).
- **Work Orders panel** — create and manage work orders inline (§3.4).
- **Dispute section** — renders only when disputed, showing the date and the citizen's reason.

### 3.4 Work Orders (`/admin/work-orders` and the Ticket Detail panel)

The record of actual field work. **A fourth, independent status track** — `pending / in_progress / completed / cancelled` — deliberately *not* coupled to `tickets.status`: completing every work order does not advance the ticket, and advancing the ticket does not touch its work orders.

- Title, internal progress **notes**, assigned office (inherited from the ticket), optional assigned admin, optional due date.
- **Assignee picker** scoped to the work order's own office; validated server-side (target must exist, be active, and belong to that office).
- **Due dates** — editable inline, with derived `overdue` / `due today` states. "Overdue" is computed from `due_date` and status, never stored.
- **"My Assignments"** — a personal filter resolved server-side from the caller's own session, so it can't be used to probe another admin's workload.
- Filters for status, office, overdue, and assignee; CSV export excludes `notes` at the query level.
- Each row shows the linked ticket's Operational Priority badge ("Op. Priority" column) — the Hazard Urgency badge until manuscript revision Phase 1, step 6a.

**`notes` is staff-only and never appears in any citizen-facing response** — enforced and regression-tested (`e2e/admin-work-orders.spec.ts` submits a sentinel note and asserts it never renders on the citizen page). ~30 tests.

### 3.5 Flagged Reports (`/admin/flagged`)

Moderation queue for integrity-flagged submissions (§5.5), on the same Precision Queue grammar as the Ticket Queue: view tabs with server counts, a collapsed filter popover with dismissable chips, column/density controls, row selection, and personal saved views (`admin_saved_views` with `surface = 'flagged'`, so the Ticket Queue's presets never appear here).

Three actions: **dismiss**, **quarantine**, **mark duplicate**. Quarantine surfaces to the citizen through the neutral banner described in §2.3, and is the only one with an immediate public consequence — which is why it is the only solid-filled control in both the row and the drawer, and the only one the server refuses without a note.

- **Review drawer** — prev/next walk the filtered page without closing it. Shows the deterministic risk score with its arithmetic spelled out (`computeRiskScore`, `lib/utils/flag-risk.ts` — duplicate 35 + location 30 + authenticity 25, +10 for a repeated signal), the evidence photo, a per-flag breakdown with its evidence string and weight, report/ticket facts, and the reporter's clean-submission rate.
- **Bulk actions** — dismiss, quarantine or mark-duplicate a selection, plus "Export selection". There is **no bulk endpoint**: the client loops `POST /admin/reports/:id/moderate`, so every report keeps its own audit event and citizen notification, and a mixed selection half-succeeds with a per-id account of what failed. Bulk quarantine asks once for the note the server requires; bulk mark-duplicate points every selected report at one canonical report, and says so.

Covered by `e2e/admin-flagged.spec.ts`.

### 3.6 Barangay Insights (`/admin/barangay-insights`)

Read-only per-barangay drill-down across all 29 Porac barangays.

- **Index** — total / active / resolved ticket counts, most common category, last activity. All 29 barangays always render, including those with zero tickets for the scoped office. (The High Urgency column was removed in manuscript revision Phase 1, step 6a.)
- **Profile** — KPI tiles (total / active / resolved; the High Urgency tile was removed in step 6a), all-time category breakdown, a fixed 30-day incident trend, a DEM-derived elevation min/avg/max (**display only, never a filter**), and the 10 most recent tickets with their Operational Priority badge, each deep-linking into the filtered Ticket Queue.

No editing, creating, or exporting — deliberately. Covered by `e2e/admin-barangay-insights.spec.ts`.

### 3.7 Interactive Map (`/admin/map`)

Leaflet map with ticket pins, a barangay choropleth, and a heatmap layer driven by the priority index. Each pin's outer ring (and each cluster's ring, for the highest value inside) shows Operational Priority's display band, as do the legend and popup — Hazard Urgency until manuscript revision Phase 1, step 5. Category / status / barangay / search filters plus the pins-vs-heatmap toggle are all URL-synced, so a filtered view is a shareable link; the urgency filter was removed in step 5 and an old `?urgency=` link is ignored. Covered by `e2e/admin-map.spec.ts` (~16 tests).

### 3.8 Notification Center (`/admin/notifications`)

Full history behind the bell, with cursor pagination and read/unread plus type filters. Available to all four admin-side roles; each admin sees only their own direct notifications plus — for officer/supervisor only — their office's office-wide rows (five-role Batch 4 fix: office-wide matching now requires `isOperationalStaff`, not merely a non-null `office`, so `system_admin` no longer sees every office's traffic and `focal` never inherits MDRRMO's office-wide operational stream despite organizationally carrying that office value). Admin-facing types include `new_citizen_report`, `ticket_critical`, `ticket_disputed`, `ticket_escalation`, `work_order_created`, `work_order_assigned`, and — Focal-specific — `new_intake_report` (direct, per-Focal-admin, never office-wide) and `report_escalated` (office-wide, to the ticket's *current* office).

### 3.9 Reports & Exports (`/admin/reports`)

A shared office/date-range filter panel driving the ticket and work-order CSV exports, plus a printable operational summary (`window.print()` with a print stylesheet; no PDF library). A third export, `GET /admin/reports/flagged.csv`, is driven from the Flagged Reports page itself rather than this panel (whole-filter or current selection).

Every export reuses the list endpoint's own filter parsing — `parseTicketQuery`, `WorkOrdersService.parseQuery`, `parseModerationQuery` — so an export can never return more than the equivalent list view already allows. The flagged export deliberately omits the risk score: that heuristic lives in frontend code (`lib/utils/flag-risk.ts`), and a second copy of its weights in the API would be a duplicate definition to keep in sync. The raw `flags` the score is derived from are exported instead.

### 3.10 System Administrator only

- **Admin Management** (`/admin/admins`) — create, edit role/office, deactivate and reactivate admin accounts. A lockout guard prevents deactivating the last active System Administrator.
- **Activity Log** (`/admin/activity-log`) — the `admin_audit_events` trail, filterable by target type. See [`security.md`](security.md) §6.
- **Own account** (`/admin/account`) — password management.

### 3.11 Focal Personnel (`/admin/focal/*`) — five-role Batches 2/4

A dedicated, municipality-wide intake-monitoring surface for Central Monitoring / Focal Personnel — deliberately **not** an all-office adaptation of the operational Ticket Queue (`admin/intake/*`, `FocalGuard`-only; officer/supervisor/`system_admin` are all rejected). Focal never mutates `tickets.status`, never Resolves/Rejects, never creates Work Orders, and never touches Operational Assessment.

- **Dashboard** (`/admin/focal`) — KPI cards (New Reports / Unacknowledged / Needs Screening / Forwarded+Escalated) and a recent-incoming-reports list, sourced from live intake data, no fixtures.
- **Intake Queue** (`/admin/focal/intake`) — every report routed to either MEO or MDRRMO, in one table (columns: Report, Location, Category, Routed To, Op. Priority, Intake State, Submitted, Action — Operational Priority replaced Hazard Urgency, and the Hazard Urgency filter was removed, in manuscript revision Phase 1, step 6b). Intake state (New/Acknowledged/Screened/Forwarded/Escalated) is derived at query time from `report_acknowledgments` + the latest `report_intake_actions` row — never a persisted column, so it can never become a second `TicketStatus`. The report reference — in this table, the dashboard list, the intake detail heading, the dialogs and the map popup — is the stored PRC tracking reference since manuscript revision Phase 2, step 2b (it was a computed "Report #<id>"; audit and notification text recorded before then keeps that form).
- **Acknowledge** — a report-level "seen this" event (`report_acknowledgments`, `UNIQUE(report_id)` — a second attempt is a clean 409, not a silent duplicate). **Acknowledged ≠ Under Review**: the ticket's real status is untouched, and the citizen receives a separate, neutrally-worded notification ("Your report has been acknowledged by municipal monitoring") plus a dedicated `acknowledged` event on their report timeline (§2.3), never conflated with a status change.
- **Initial Screening** — records only a recommendation (continue / forward / escalate) as a `report_intake_actions('screened')` row. Recording a "forward" or "escalate" recommendation does **not** execute either action itself — the dialog flow saves the screening first, then optionally opens the corresponding Forward/Escalate dialog; canceling that follow-up leaves the report in the Screened state.
- **Forward** — reuses `TicketsService.reassignOffice` (the exact same mechanism the Assignment panel uses, §3.3) with a Focal-specific authorization branch: only while the ticket is still `Reported` and no Work Order has reached `pending`/`in_progress` on it. Writes the same `office_reassignments` row an office-admin reassignment would, plus a `report_intake_actions('forwarded')` row; ticket status is untouched.
- **Escalate** — an attention signal only. Never changes Operational Priority, ticket status, or office; notifies the ticket's *currently* responsible office (which may differ from the office at submission time, if already forwarded).
- **Interactive Map** (`/admin/focal/map`, Batch 4) — municipality-wide incoming-report locations (report reference, category, barangay, coordinates, routed office, Operational Priority — pins coloured by its display band, Hazard Urgency until step 6b — and intake state), from its own narrow `GET /admin/intake/geo` query — never the operational `/admin/tickets/geo` endpoint or its heatmap/clustering machinery. Read-only; no mutation controls.
- **Flagged Reports** (`/admin/focal/intake?flagged=true`, Batch 4) — a filter on the same Intake Queue table, not a duplicated page. Focal can inspect integrity flags relevant to intake but cannot quarantine or otherwise perform operational moderation disposition (§3.5 stays `OperationalStaffGuard`-only).
- **Notifications** (`/admin/notifications`) — the same shared Notification Center as every other admin role (§3.8), safe for Focal as-is since its scoping is already role-aware.

New-report fan-out: every report routed to MEO or MDRRMO sends a direct, per-admin `new_intake_report` notification to each active Focal account (`ReportsService.notifyFocalIntake`) — never `recipientOffice: 'MDRRMO'`, which would incorrectly mix Focal-intake traffic into MDRRMO's own operational notification stream.

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

Since manuscript revision Phase 1, step 3, **every report creates its own ticket**. The former automatic merge (category-specific radius + 7-day window, `member_count` increment, centroid recompute, `report_merged` notification, `pg_advisory_xact_lock`) was removed: the manuscript requires a human to confirm any grouping (handoff Decision 1). Phase 3 adds suggested related tickets within 20 / 50 / 100 m (`api/src/common/utils/radius.ts`) and a staff Merge action with audit. Existing multi-report tickets from the old automatic merge are unchanged.

Photo-level duplicate detection (`DUPLICATE_IMAGE`, perceptual hash) is a separate evidence check and still runs on every submission (§4.5).

### 4.4 Operational Priority

```
priority_index = round(1 + 99 × (0.5 × severity + 0.25 × min(age / 7 days, 1) + 0.25 × barangay demand)), clamped to 1–100
```

- **Severity** — the highest citizen severity among the ticket's reports (Low 0.25 / Medium 0.5 / High 0.75 / Critical 1).
- **Age** — saturates at 7 days.
- **Barangay demand** — the barangay's active-ticket count, normalized against the busiest barangay.

Recalculated on demand when an admin loads the dashboard, ticket list, ticket detail or map, after every report submission, and daily as a safety net by the cron workflow (`POST /cron/recompute-priority`). The Low / Medium / High band shown next to it (1–33 / 34–66 / 67–100) is a display convention, not a stored threshold. Full reference: [`triage-model.md`](triage-model.md).

The former **Hazard Urgency** score (elevation + rainfall + cluster) was retired in manuscript revision Phase 1 and is no longer calculated or shown — see `triage-model.md` §12.

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

Four cron routes (`api/src/cron/`), all behind a shared secret, run daily via GitHub Actions: Operational Priority recalculation (`recompute-priority`, which replaced the Hazard Urgency `recompute-urgency`/`recompute-weather` pair in manuscript revision Phase 1, step 7a) and three cleanup jobs (expired reset tokens, old read notifications, old rate-limit events). The former 7-day **ticket escalation check** was removed in manuscript revision Phase 1, step 2: the manuscript uses 7 days only as Operational Priority's age cap, never as an escalation rule (p. 74). Existing `ticket_escalation` notifications remain readable as history ("Ticket Needs Review"); nothing creates new ones.

---

## 5. Cross-cutting notes

### 5.1 Severity vs. Operational Priority vs. Operational Assessment

Four distinct concepts that are easy to conflate. The authoritative definitions are in [`CLAUDE.md`](../CLAUDE.md); in short:

| Term | Source | Meaning |
|---|---|---|
| **Severity** | Citizen input | Subjective Low/Medium/High/Critical on a report. Never computed. |
| **Operational Priority** | Computed | `priority_index` — citizen severity + ticket age + barangay demand (§4.4). How soon staff should act. Powers the queue order, the Ticket Detail Operational Priority card, the admin map and Focal Intake. Never shown to citizens. |
| **Operational Assessment** | Staff input | MEO/MDRRMO's human assessment of a ticket. No score, level or band. |
| **Dispute** | Citizen action | A workflow signal on a resolved ticket. Not a score, not a status. |

Hazard Urgency was retired in manuscript revision Phase 1; Hazard Information (DENR-MGB susceptibility, advisory only) arrives in Phase 4.

### 5.2 Office scoping

Enforced on the server, every time, from the session — never from a query parameter. A hand-crafted `?office=MDRRMO` from an MEO session returns MEO data. List endpoints **silently clamp**; single-resource reads and writes **hard-reject with 403**. Regression-tested in `e2e/admin-tickets.spec.ts`, `e2e/admin-work-orders.spec.ts`, `e2e/admin-rbac.spec.ts`, and `e2e/admin-barangay-insights.spec.ts`. Details in [`security.md`](security.md) §3.

### 5.3 Citizen / admin separation

Two independent auth systems; two independent sets of API routes. No citizen-facing surface exposes work orders, work-order notes, internal moderation notes, or another citizen's reports. This is a standing product rule, not merely current state.

### 5.4 SSR/API resilience

A transient Next → NestJS connection failure during server rendering (e.g. an API restart) no longer replaces the whole admin or citizen app with the framework's default error screen. `app/error.tsx` catches the failure at the root, above both the admin and citizen layouts; `app/admin/error.tsx` gives admin pages the same page-level recovery the six citizen `error.tsx` boundaries already had. Both retry via re-fetching rather than a plain reset, so a working "Try Again" click actually recovers the page once the API is back.

The retry button shows a "Retrying…" pending state and is disabled while a retry is in flight, so a slow retry doesn't look like a dead button. Each boundary offers one secondary navigation action alongside retry: the admin boundary links to `/admin/login`, the citizen boundary (`CitizenErrorState`) links to `/reports`, and the audience-neutral root boundary keeps a plain `/` link since it can catch a throw from either layout. User-facing copy stays one generic, honest message in both environments — a production build serializes a Server Component error's `digest` with no `message` field at all, so a "network unreachable" vs. "API errored" distinction is not reliably readable client-side; `error.digest` is still logged to the server console (and shown as a short reference line) for correlating a report with server logs.

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
