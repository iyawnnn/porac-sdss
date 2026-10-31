# User Flows

**How each type of user actually works with PORAC-SDSS**, start to finish. Written for developers onboarding, capstone reviewers, future maintainers, and LGU stakeholders who need to understand the operational shape of the system rather than its code.

Every flow below is implemented. Where something is pending or deliberately absent, it is marked as such rather than described as working.

**Related:** [`features.md`](features.md) is the feature inventory (what exists); this file is the narrative (how it is used). [`triage-model.md`](triage-model.md) explains the scoring. [`security.md`](security.md) explains the enforcement behind the boundaries in §6. [`testing.md`](testing.md) covers verification. [`project-status.md`](project-status.md) tracks shipped work, the current queue, and deferred items.

---

## The five user types

Five-role architecture (Batches 1–5) — Citizen plus four distinct admin-side user types, not "office admin vs. system admin" alone:

| User type | Signs in at | Scope |
|---|---|---|
| **Citizen** | `/login`, `/signup` | Their own reports, plus a city-wide ticket map |
| **MEO personnel** | `/admin/login` | MEO tickets, work orders, and Operational Assessment only |
| **MDRRMO personnel** | `/admin/login` | MDRRMO tickets, work orders, and Operational Assessment only |
| **Focal Personnel** | `/admin/login` | Municipality-wide report intake (both offices) only — never the operational Ticket Queue, Work Orders, or Operational Assessment; see §5 (Focal flow) |
| **System Administrator** | `/admin/login` | Admin management and the activity log only — **no operational access of any kind, and no Focal Intake access either** |

**A note on account types:** since manuscript revision Phase 2, step 2e, staff accounts carry the Appendix H `account_type` (Personnel or System Administrator), `office` and `is_focal` instead of a role. MEO and MDRRMO personnel are both **Personnel** with an office; Focal Personnel is Personnel on MDRRMO with `is_focal`. The old `officer` and `supervisor` roles carried no behavioral difference and are both plain Personnel now. Every permission check distinguishes *operational Personnel* from *Focal Personnel* from *the System Administrator* — three structurally separate allowlists, not one axis. (`admins.role` survives only as an unread sync mirror until Phase 8.) If a future requirement needs staff ranks to differ, that is new work.

**A note on the System Administrator's scope:** it was city-wide operational plus administration until Batch 1 of the five-role architecture, which removed the operational half entirely — a genuine authority reduction, not a rename. The System Administrator today reaches *only* Admin Management, the Activity Log, and its own Account & Security — see §4 below, rewritten to match.

---

## 1. Citizen flow

### 1.1 Getting an account

There is **no guest or anonymous reporting** — an account is required to submit. This is deliberate (it is what makes per-account rate limiting possible) and is a documented deviation from the original plan.

- **Sign up** at `/signup` with first name, last name, email, password.
- **Log in** at `/login`.
- **Google sign-in** is available when the deployment configures it; omitting the Google environment variables removes the option entirely and nothing else changes.
- **Forgot password** at `/forgot-password` sends a reset link valid for 30 minutes. The response is identical whether or not the email exists, so the form cannot be used to discover who has an account.

Sessions last 30 days — deliberately long, because this is infrequent outdoor mobile use and re-login friction would suppress reporting.

### 1.2 Submitting a report

At `/report`. The form enforces an order deliberately: **evidence first, then location.**

1. **Attach a photo.** The map and barangay picker stay disabled until one is attached — location is anchored to a photograph, not typed in freehand.
2. **The browser reads the photo's EXIF GPS.** Three outcomes, all shown plainly:
   - *GPS found, inside the municipality* → "GPS Metadata Verified (EXIF Found)", location pre-filled.
   - *No GPS in the photo* → prompt to place the pin manually on the map.
   - *GPS outside Porac* → "Photo GPS location is outside Porac municipality bounds."
3. **Confirm or place the pin.** Moving the pin more than 50 m from the photo's GPS shows a warning that the submission will be flagged for review. **It does not block submission** — the citizen can still file it.
4. **Choose a category** (13 options) and **a severity** — Low, Medium, High, or Critical. This is the citizen's own judgement of how bad it is, and each level is listed with the manuscript's description:
   - *Low* — minor impact; normal access or use is mostly unaffected.
   - *Medium* — noticeable impact; access or use is still possible with caution.
   - *High* — major disruption or a clear safety concern.
   - *Critical* — immediate serious danger, or the area or service is effectively blocked or unusable.

   **Choosing Critical asks for confirmation** ("Confirm Critical severity"), with a reminder that a report does not dispatch help and that anyone in immediate danger should call emergency hotlines. "Choose another level" (or closing the dialog) puts back the previous level. The form submits Critical only once it is confirmed, and asks again if the citizen changes the level away and back.
5. **Submit.**

Behind the scenes the server recomputes everything it will not take on trust: which barangay the point falls in and the integrity flags. It also decides whether this report is a new ticket or joins an existing one (§1.3).

**Rate limits apply** and will surface as a clear message: 5 reports per hour per account, and 3 within 25 m of each other per 24 hours. The second exists to stop the same pothole being filed ten times.

### 1.3 Tracking a report

- **`/reports`** lists the citizen's own reports with category, barangay, status, and which office is handling it. A first-time account sees an empty state with a "Report Hazard" prompt.
- **`/dashboard/reports/[id]`** shows one report's timeline, beginning with "Report submitted", and its current status.

Two situations get their own explanation on that page:

- **Merged into an existing ticket.** Shown only for reports that belong to a ticket with earlier reports (historical automatic merges; since manuscript revision Phase 3, step 3d, merges confirmed by staff). The page says *"Merged with an existing issue"* and *"Grouped with N other report(s)."* The citizen is told their report joined a group — not that it was rejected or ignored. The status shown is always that of the ticket the report belongs to now, so after a merge it is the surviving ticket's status; the regrouping itself sends no notification.
- **Corrected by staff.** Staff may correct a ticket's category or location (manuscript revision Phase 3, step 3e). The report page then shows the current category with *"You reported: …"* under it, and the corrected location; the citizen's own pin stays on their report. No notification is sent.
- **Held for review (quarantined).** If an admin quarantines the report, the citizen sees a deliberately neutral banner: the report *"needs another look before it appears on the public map"*, and explicitly that **this does not affect the ticket's progress**. The admin's internal reasoning for the quarantine is never shown.
- **Acknowledged by municipal monitoring** (five-role Batch 2). Once Focal Personnel acknowledges the report (§5), the timeline gains its own **"Acknowledged by municipal monitoring"** event, sourced from `report_acknowledgments.acknowledged_at` — a municipal-monitoring signal, not a ticket-status value. **Acknowledged ≠ Under Review**: the report's status line above can still read `Reported` at the same time the timeline shows it acknowledged, and that is correct, not a bug.

### 1.4 When the work is done

Once the ticket reaches **Resolved**, the report page gains two cards:

- **Case Closure Summary** (read-only) — the date it was resolved, the staff's completion notes, the staff's resolution photo, and a recap of the citizen's own feedback once given.
- **Resolution Feedback** (the action) — two buttons:
  - **Confirm Fixed** — recorded permanently and survives reload. No office notification, because a confirmation needs no action.
  - **Report Still Not Fixed** — asks "What's still wrong?", records the reason, **notifies the assigned office**, and marks the ticket as disputed in the admin queue.

Each citizen who reported the issue answers once, for themselves, and the answer is then locked; another reporter's answer never blocks theirs and is never shown to them (manuscript revision Phase 3, step 3g). A dispute never moves the status backwards and never changes any score — it is a flag for staff attention, not a re-opening. Staff see every answer on Ticket Detail's Citizen feedback card ("N confirmed, M disputed").

### 1.5 Notifications and the map

- **Notifications** arrive in a bell and link straight to the relevant report. Citizens receive: report received, report quarantined, flagged as duplicate, and each status change (under review, in progress, resolved).
- **`/map`** shows city-wide ticket pins over the municipal boundary. It requires a citizen session — it is city-wide in *content*, not open to the public. Other people's reports are privacy-limited (manuscript Appendix L, since manuscript revision Phase 1, step 6d): the pin is approximate (about 100 m) and the popup shows only status, category, barangay, reported and last-update dates, the handling office and a short public update — no title, photo or reporter. On their own reports, "View my report" opens the full detail.

**What a citizen never sees:** work orders, internal staff notes, moderation reasoning, any system score (Operational Priority), or anyone else's report details.

---

## 2. MEO personnel flow

MEO handles the built-environment backlog.

### 2.1 Categories that reach MEO

A Phase 3 follow-up (manuscript alignment) replaced the citizen-selectable category list with a more explicit set. Pothole / Road Surface Damage, Uneven Sidewalk, Damaged Manhole Cover, Clogged Drainage / Damaged Culvert, and Streetlight Out are **MEO's direct responsibility** — routing is automatic by category, nobody assigns tickets manually on arrival. "Other Minor Infrastructure Hazard" also lands in MEO's queue but is intake/manual-review only, not automatically owned.

Illegal Dumping Affecting Drainage or Road, Overgrown Vegetation Obstructing Road or Signage, and Leaking Pipe / Water Supply Concern also land in MEO's queue by default (MDRRMO is never a sensible custody office for these), but are flagged **Referral** — coordination concerns for an external agency (water/electric utility, solid-waste enforcement, barangay-level clearing), not direct MEO repair work. Ticket Detail shows a "Referral — coordinate externally" badge and a "Log Referral" action for these; logging a referral records the agency/target and a note as a permanent, dated history entry — it is documentation, not a live "pending" status, and doesn't change the ticket's office or lifecycle status.

"Uncollected Garbage" is no longer offered on the citizen report form — routine solid-waste collection is outside direct MEO/MDRRMO responsibility unless it's affecting roads/drainage, which the Illegal Dumping category now covers. Historical tickets filed under the old category list (Pothole, Clogged Drain, Uncollected Garbage, etc.) remain fully readable, displayable, and filterable — see [`database.md`](database.md) for the exact legacy → current mapping.

### 2.2 A working session

**Log in** at `/admin/login`. Sessions last 8 hours — roughly one shift.

**The dashboard (`/admin`)** opens on MEO's numbers only. No toggle exists to see MDRRMO's, because there is nothing to toggle. Useful sections in practice:

- **Needs Attention** — overdue work orders, work due today, and flagged reports pending. This is the "what did I miss" panel.
- **Office Performance Summary** — pending / in progress / overdue / completed-this-week work orders, flagged reports waiting.
- **Map Presets** — one-click into a pre-filtered map: Drainage Issues, Potholes & Road Damage, Illegal Dumping.

**The Ticket Queue (`/admin/tickets`)** is the main triage surface, sorted by Operational Priority by default. Filter by status, category, barangay, free text, or "Disputed only". Every filter is reflected in the URL, so a filtered view is a link that can be sent to a colleague. Works on a phone — the table becomes cards below tablet width.

**Ticket Detail** is where the actual decision happens:

- Status, assigned office, Operational Priority badge at the top.
- **Operational Priority breakdown** — severity, age and barangay demand with their explicit weights and contributions, not just a final number. See [`triage-model.md`](triage-model.md) for what those factors mean and their limits.
- **Evidence & reports** — every citizen report merged into this ticket, with photos and integrity flags. On a ticket with two or more reports, each report can be **removed** (it gets a ticket of its own, routed as a new report) or **moved** to a related ticket — both with a reason (see Grouping reports below).
- **Possibly related tickets** — active tickets of the same category nearby, each with a **Merge…** action (see Grouping reports below).
- **Location** — map, barangay, coordinates.
- **Work Orders panel** — create and manage the actual field work.

#### Grouping reports: Merge, Remove, Move

The system never groups reports by itself (manuscript revision Phase 1, step 3); it only suggests possibly related tickets. When MEO or MDRRMO staff decide two tickets are the same incident, **Merge…** on the suggestion opens a dialog: choose which ticket continues (the older one by default), give a reason, confirm. The other ticket's reports move to it; the surviving ticket keeps its own location, status and Work Orders, and its report count and Operational Priority update. The merged-away ticket stays as read-only history with a banner — "Merged into Ticket #A on {date} by {name}. Reason: {reason}" — and the survivor shows "Includes reports merged from Ticket #B".

A merge is refused, with the reason in the dialog or the disabled button's tooltip, when the tickets have different categories (correct the category first), different offices (Reassign or Refer first), or the ticket being merged away still has a pending or in-progress Work Order (finish or cancel it first). Staff act only on their own office's tickets.

A report that does not belong on its ticket can be **removed** (it gets a new ticket, routed exactly as a new report would be) or **moved** to a related ticket of the same category and office. Every one of these actions needs a reason and appears in the Activity Log.

#### Correcting the category or location

A report can arrive with the wrong category or a pin in the wrong spot. **Correct category…** and **Correct location…** under the Ticket Detail header fix the ticket (manuscript revision Phase 3, step 3e); the citizen's own report keeps what they submitted, and Ticket Detail shows it as "Citizen-reported category" and "Citizen pin". Both need a reason, and both appear on the ticket's timeline and in the Activity Log.

- A category the other office handles moves the ticket there in the same step, recorded as a Reassign with the same reason. That is refused while the ticket has a pending or in-progress Work Order — finish or cancel it first. Once the ticket has moved, it belongs to the other office's queue.
- A location is picked on a small map (or typed); it must be inside a Porac barangay, the barangay follows the point, and Operational Priority is recalculated.

### 2.3 Moving a ticket forward

One button advances the status: **Reported → Under Review → In Progress → Resolved.**

The final step is different. "Advance to Resolved" opens a dialog that asks for **completion notes** and accepts a **resolution photo**. That photo and those notes are what the citizen later sees in their Case Closure Summary, so they are written for a public audience, not as internal shorthand. After Resolved there is no further transition.

**Rejecting a ticket** (Phase 4 workflow completeness) is a separate action, not a step on this ladder — it's offered next to the status tracker while the ticket is still `Reported`, `Under Review`, or `In Progress`, and requires a reason. Maria (the citizen) is told why, both in-app and by email where mail delivery is configured. Once rejected, the ticket is terminal — same as Resolved — and the reject action disappears.

### 2.4 Work orders

Work orders track the field work needed to close a ticket. A ticket can have several.

Each carries a title, **internal progress notes**, an assigned office, optionally a specific assigned admin, a due date, and its own status: pending → in progress → completed (or cancelled).

**Work order status is completely independent of ticket status.** Completing every work order does not advance the ticket, and advancing the ticket does not touch its work orders. A person decides when the ticket is actually resolved.

Practical bits: due dates are editable inline and derive "overdue" and "due today" automatically; **"My Assignments"** filters the list to work assigned to you personally; and `/admin/work-orders` gives a cross-ticket view filtered by status, assignee, or overdue.

**Internal notes are staff-only, permanently.** They are excluded from every citizen response and even from the CSV export — not filtered out afterwards, but never selected in the first place.

### 2.5 Other surfaces available to MEO

- **Interactive Map** — pins, barangay choropleth, heatmap. All filters URL-synced.
- **Barangay Insights** — all 29 barangays with MEO's ticket counts, and a per-barangay profile with trend, category breakdown, and elevation context.
- **Flagged Reports** — the moderation queue: dismiss, quarantine, or mark duplicate.
- **Reports & Exports** — CSV for tickets and work orders, plus a printable summary. **Yes, office admins have this**; the export is automatically scoped to MEO.
- **Notification Center** — full history behind the bell.

### 2.6 What MEO cannot do

- **See any MDRRMO ticket, work order, or count.** Requesting one directly returns 403; a filtered list simply omits them. Editing the URL does not help — scope comes from the session, not the request.
- **Reach Admin Management or the Activity Log** — System Administrator only.
- **Probe another admin's assignments** — "My Assignments" resolves to *you*, server-side.

**One thing MEO *can* do that is often assumed otherwise: reassign a ticket to MDRRMO.** The office that holds a ticket can hand it to the other office — useful when a "pothole" turns out to be a drainage failure. **Reassign** on Ticket Detail opens a dialog that asks for a **reason**; it is refused on a Rejected ticket and while a Work Order is pending or in progress (finish or cancel it first), and the button says why when it is unavailable. It is a **one-way hand-off**: once reassigned, the ticket is MDRRMO's, the dialog says so and offers the way back to the queue, and MEO can no longer open it or take it back. Every reassignment is recorded with who did it, when, and the reason (manuscript revision Phase 5, step 5a).

**Refer** is the other routing action: on a referral/coordination category (Leaking Pipe, Illegal Dumping, Overgrown Vegetation, Other), it records that the ticket was referred to an external agency (MENRO, DPWH, a utility, the barangay, or another named agency), again with a required reason, under the same rules. The office keeps the ticket and its status; the timeline shows "Referral recorded — {agency}: {reason}". Manual routing is only these two actions — there is no Forward or Escalate.

---

## 3. MDRRMO personnel flow

MDRRMO handles hazard and disaster-risk incidents. **The interface is identical to MEO's** — same dashboard, queue, detail page, work orders, map, insights, exports, notifications, and the same 8-hour session. Only the data differs. This section covers what is genuinely different.

### 3.1 Categories that reach MDRRMO

Four, all direct responsibility: **Localized Flooding, Rain-Induced Slope Failure/Landslide, Lahar or Volcanic Debris-Flow Threat, Fallen Tree or Storm-Related Road Obstruction.** A smaller set than MEO's, but the categories most tied to weather and terrain — which is where Phase 4's Hazard Information (DENR-MGB susceptibility) will matter most. (Damaged Manhole Cover and Clogged Drainage / Damaged Culvert route to MEO — a drainage structure defect is built-environment maintenance, not a disaster-response concern, even though it can contribute to flooding. The old "Clogged Drain" legacy category routed the same way.)

### 3.2 Where the emphasis differs

**The queue order is the same Operational Priority as MEO's** — citizen severity, ticket age and how busy the barangay is. The system computes no hazard or risk score: the former Hazard Urgency score (terrain + rainfall + cluster) was retired in manuscript revision Phase 1, and DENR-MGB flood/landslide susceptibility arrives as advisory Hazard Information in Phase 4. Until then, MDRRMO staff judge hazard themselves, and record it in the Operational Assessment.

Treat the priority number as a **ranking aid that shows its work**, not as a calibrated risk probability (see [`triage-model.md`](triage-model.md)). The factor breakdown on Ticket Detail exists so a decision can be sanity-checked rather than taken on faith.

**Map Presets** for MDRRMO go to Flooding Reports and Fallen Trees.

**Barangay Insights** is more useful here than for MEO: repeated flooding in one barangay shows as a pattern across the 30-day trend and category breakdown, with elevation range shown as context. Note elevation is **display only** — it is not a filter, and no elevation-based map filter exists (deferred; see [`project-status.md`](project-status.md) §5).

### 3.3 Everything else

Status workflow, resolution with notes and photo, work orders, notifications, and exports all behave exactly as in §2.3–§2.5, scoped to MDRRMO.

### 3.4 What MDRRMO cannot do

The mirror image of §2.6 — no access to MEO tickets or work orders (403 on direct access, omitted from lists), no Admin Management, no Activity Log. Enforcement is tested in **both** directions, not just one.

MDRRMO can likewise hand a ticket to MEO, one-way, with the same audit trail.

---

## 4. System Administrator flow

Account administration only — **not an operational desk of any kind.** This is the one flow that changed shape, not just gained a neighbor, when the five-role architecture landed: Batch 1 removed System Administrator's prior city-wide operational access entirely, as a genuine authority reduction (not a rename, and not something later batches walked back).

### 4.1 No operational visibility

There is no office picker, no city-wide dashboard, no ticket queue, no work orders, no map, no barangay insights, no reports/exports, and no Focal Intake — visiting any of those routes as the System Administrator is rejected server-side (`OperationalStaffGuard`/`FocalGuard`) and the page renders its own "Unavailable" error state rather than any operational content. There is no "MEO vs MDRRMO comparison" dashboard widget anymore; it was part of the operational Dashboard this account no longer reaches.

### 4.2 Ticket reassignment — not available

System Administrators cannot reassign a ticket, view one, or reach `/admin/tickets/[id]` at all. Correcting a mis-routed ticket is now an **office-to-office action**: the owning office's own admin reassigns it away (§2.5/§3.4's Assignment panel), or Focal Personnel can Reassign it early under the narrower rule in §5, if the ticket is still `Reported` with no active Work Order. There is no "city-wide correction" path anymore, and the System Administrator never reassigns or refers.

### 4.3 Admin management (`/admin/admins`)

Exclusive to this account type:

- **Create** an admin — email, name, account type, office. **Personnel** needs an office (MEO or MDRRMO); **Focal Personnel** is always MDRRMO (organizational, not operational — see The five user types above); the **System Administrator** has none. An invalid combination is rejected (400), and the database enforces the same rule.
- **Change** account type or office.
- **Deactivate / reactivate.** Deactivation is immediate and total: the admin cannot log in, and **any session they currently hold dies within the request cycle** rather than lingering until its 8-hour expiry. Reactivation restores access with the same password.
- **Reset another admin's password**, which takes effect immediately and invalidates that admin's other sessions.

Two guardrails worth knowing:

- **The last active System Administrator cannot be deactivated.** The system refuses to lock itself out of its own administration.
- **A System Administrator cannot reset their own password through Admin Management.** They use their own Account & Security page, which requires the current password.

### 4.4 Activity Log (`/admin/activity-log`)

The audit trail: account creation, account type/office changes, deactivations, ticket status changes and reassignments, report moderation, and the full work-order lifecycle. Filterable by target type.

Three properties that matter for oversight:

- **Written in the same transaction as the action itself** — if the audit write fails, the action rolls back. The trail is load-bearing, not best-effort.
- **The actor's name, role, account type, and office are snapshotted at write time**, so history reads correctly even after that admin is later edited. Every actor, old or new, displays as Personnel (with the office), Focal Personnel or System Administrator; the stored role of older events is never rewritten.
- **Field *names* are logged, never contents** — you can see that a work order's notes changed, never what they said.

**Not audited:** CSV exports (read-only, with no single target to attach an event to) and login events. Login auditing is a known gap tracked in [`security-hardening-plan.md`](security-hardening-plan.md).

### 4.5 What a System Administrator should not expect

- **It cannot be used as a triage or intake account, even in an emergency.** This is now enforced server-side, not just discouraged — there is no operational surface to reach.
- **It does not bypass office boundaries.** Post-Batch-1, it doesn't bypass anything operational; its authority is scoped to account/system administration only.
- **Keep the number of these accounts small anyway.** They still administer every other admin account in the system, including creating/deactivating other System Administrators.

---

## 5. Focal Personnel flow

Focal Personnel — municipality-wide report intake, never operational execution (and never a Work Order assignee). Full feature inventory in [`features.md`](features.md) §3.11; this is the narrative shape.

### 5.1 What Focal is for

Focal sits between the citizen's submission and the owning office's operational queue: a first-pass monitoring/screening desk that sees every incoming report from both MEO and MDRRMO in one place, before or alongside the owning office picking it up in their own Ticket Queue. **Focal does not own technical validation or operational response** — it never sets a ticket's status, never resolves or rejects, never creates a Work Order, and never touches Operational Assessment; those remain entirely the owning office's responsibility (§2–§3).

### 5.2 Acknowledge, screen, reassign or refer

1. **Acknowledge** — a one-time, report-level "seen this" event. Acknowledging is not a status change: the ticket's real lifecycle status is untouched, and the citizen sees a separate, neutral notification and timeline event (§1) — never anything implying "Under Review."
2. **Severity screening** (manuscript Table 2; manuscript revision Phase 3, step 3f) — on the intake detail's Severity screening card, Focal reads the citizen's severity against the photo and description and records **No concern noted** or **Requires operational validation**, with optional remarks, while the ticket is still active. The report then shows as Screened in the Intake Queue, and MEO/MDRRMO see "Focal screening: …" on that report in Ticket Detail. Focal can screen again later; the new values replace the old. It is advisory: the citizen's severity and Operational Priority stay exactly as they were, and the citizen never sees it. It replaced the old Initial Screening recommendation (continue / forward / escalate); earlier screenings of that kind stay in the activity list as history.
3. **Reassign** or **Refer** (manuscript revision Phase 5, step 5a; Decision 10), **only while the ticket is still `Reported` and no Work Order is pending or in progress** — an early routing correction, through the same dialogs, the same reason requirement and the same recorded history as the owning office's own (§2.5/§3.4), not a separate path. Reassign moves the ticket to the other office; Refer records an external agency. Once operational review or work has begun, both buttons are disabled with the reason, and the correction becomes the responsible office's own decision.
4. *(Forward and Escalate were removed in step 5a — manual routing is only Reassign or Refer. Reports forwarded or escalated earlier still show it in their activity list and intake state.)*
5. **Merge** a possibly related ticket (manuscript revision Phase 3, step 3d), under the same Focal rule: only while every ticket involved is still `Reported` with no active Work Order, in either office. The same category and office rules apply as for MEO/MDRRMO staff (§2.2, Grouping reports), so two reports routed to different offices need a Reassign first.
6. **Correct the category or location** of the report's ticket (step 3e), under the same rule: only while it is still `Reported` with no active Work Order, in either office. A category the other office handles moves the ticket there, recorded as a Reassign with the correction's reason.

### 5.3 Read-only situational awareness

Focal's Interactive Map and Flagged Reports are both intake-scoped read views (§3.11) — useful for spotting geographic patterns or integrity concerns worth screening more carefully, not a parallel operational map or moderation queue. Neither exposes a mutation control.

### 5.4 What Focal should not be asked to do

- **Do not expect Focal to validate a report technically** (e.g. "is this pothole real/serious") — that is the owning office's Operational Assessment (§2.5/§3.4), a distinct, human-entered layer Focal cannot create or edit.
- **Do not expect Focal to resolve a citizen's problem.** Acknowledgment and screening are monitoring signals, not case resolution.
- **Do not give Focal an office-wide operational account as a workaround** for something it can't currently do — if a real gap exists, it belongs in [`project-status.md`](project-status.md) §4/§5 as a scoped requirement, not an ad hoc permission change.

## 6. End-to-end scenario

A flooded road in Barangay Cangatba, during the rainy season.

**1 — Maria reports it.** Standing at the edge of the water, she opens `/report`, photographs the flooded stretch, and the app reads the photo's GPS and confirms it is inside Porac. She picks **Localized Flooding**, marks severity **High**, and submits.

**2 — The system processes it.** The server resolves the point to Cangatba, checks the photo for integrity problems (none — fresh photo, GPS matches the pin), and creates a **new ticket** for her report — even though a neighbour filed a Localized Flooding report nearby 40 minutes earlier. Since manuscript revision Phase 1, step 3 the system never merges reports on its own; MDRRMO staff see the neighbour's ticket under "Possibly related tickets" and decide whether to merge (§2.2, Grouping reports).

Maria gets a "Report received" notification. Because Localized Flooding routes to MDRRMO, the ticket sits in their queue.

**3 — Operational Priority is computed.** High citizen severity puts the ticket well up the queue; its priority keeps rising as it ages. There is no hazard score — the ticket's danger is for MDRRMO staff to judge.

**4 — MDRRMO picks it up.** Ronald opens `/admin` at the start of his shift; the ticket is near the top of the Operational Priority queue. On Ticket Detail he reads the photos, checks the priority breakdown (high severity, not just a busy barangay), records an Operational Assessment of the flooding, and advances the status to **Under Review**, then **In Progress**. Maria gets a notification at each step.

**5 — Field work.** Ronald creates a work order — *"Clear blocked drainage inlet, Cangatba main road"* — assigns it to a colleague, sets tomorrow's due date, and later adds the internal note *"Inlet blocked by construction debris; coordinated with MEO for hauling."* **Maria never sees any of that.** He moves the work order to *in progress*, then *completed* — which does **not** advance the ticket. That stays a human decision.

**6 — Resolution.** Once the water has cleared, Ronald clicks "Advance to Resolved". The dialog asks for completion notes and a photo. He writes *"Drainage inlet cleared and flushed. Road passable."* and attaches a photo of the cleared road.

**7 — Maria sees the outcome.** Her report page now shows a **Case Closure Summary**: the date, Ronald's notes, and the after photo — followed by two buttons.

**8a — It worked.** She taps **Confirm Fixed**. It is recorded permanently. No one is paged.

**8b — Or it did not.** If the water returns the next day, she taps **Report Still Not Fixed** and writes why. That notifies MDRRMO, marks the ticket **Disputed** in their queue with a badge and a filter, and shows Ronald her reason on Ticket Detail. The status does not roll back and no score changes — it is a flag for human attention.

**Meanwhile,** a ticket that sits unattended is not escalated by any timer — the nightly 7-day escalation job was removed in manuscript revision Phase 1, step 2. Ageing instead raises the ticket's Operational Priority (the age factor reaches its cap at 7 days), so it climbs the queue rather than paging anyone.

---

## 7. Boundaries and data visibility

The rules that define who sees what. Enforcement details are in [`security.md`](security.md); this is what they mean in practice.

**1 — Citizens and admins are separate systems.** Not just separate pages: separate sessions, separate cookies, separate API routes. A citizen account cannot reach an admin route by any URL, and vice versa.

**2 — Office scoping comes from the session, never the request.** An MEO admin who edits the URL to ask for MDRRMO data gets MEO data. Lists silently narrow; direct access to another office's ticket or work order returns 403 — and this now includes after a reassignment, since the check always re-derives the resource's *current* office rather than a cached value. Tested in both directions.

**3 — The System Administrator sees neither office's operational data.** Since Batch 1, it is the *only* admin-side account type with no operational scope at all — not even read-only, not even city-wide — and it reaches only Admin Management and the Activity Log. It is not a superset of the other accounts; it is a structurally separate, narrower one.

**4 — Focal Personnel sees municipality-wide intake, never operational detail.** Focal is the one account that legitimately sees across both offices — but only through the dedicated Intake surface (§5), never the operational Ticket Queue, Work Orders, or Operational Assessment, and never MDRRMO's office-wide operational notification stream despite organizationally carrying that office.

**5 — Internal content never reaches citizens.** Work orders, work-order notes, moderation reasoning, a citizen's own dispute reason, Focal intake actions/remarks, and Operational Assessment content are all staff-only. This is structural, not cosmetic: citizen response types have no work-order or intake-internal fields at all, and the CSV export never even selects the notes column. There is a regression test that plants a sentinel note and asserts it never appears on the citizen's page.

**Citizens do see** their own reports in full and, on the map, city-wide ticket pins with privacy-limited details (approximate location, no title or photo — step 6d). They see no system score at all — no Hazard Urgency (its band was removed from citizen pages in manuscript revision Phase 1, step 6c), no factor breakdown, no Operational Priority — and no Operational Assessment or Focal intake state. They do see a separate **acknowledgment** event on their own report's timeline (§1) once Focal has acknowledged it — this is not a ticket-status value and is never rendered as one.

---

## 8. Pending and deferred

Not implemented. Listed so no one plans a workflow around them.

- **Login attempt throttling and security headers — pending.** See [`security-hardening-plan.md`](security-hardening-plan.md).
- **No citizen-facing work-order visibility**, not even a summary. Deliberate, and would need an explicit product decision.
- **No elevation-based map filter** — elevation is display-only.
- **There is one kind of operational Personnel.** The old `officer` and `supervisor` roles behaved identically and are both Personnel since Phase 2, step 2e; any workflow distinction between staff ranks would be new work.
- **Deferred product ideas** — crew scheduling, attachments and checklists, inspection logs, a due-date calendar, barangay editing, PDF export, scheduled reports. See [`project-status.md`](project-status.md) §5.
