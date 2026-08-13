# User Flows

**How each type of user actually works with PORAC-SDSS**, start to finish. Written for developers onboarding, capstone reviewers, future maintainers, and LGU stakeholders who need to understand the operational shape of the system rather than its code.

Every flow below is implemented. Where something is pending or deliberately absent, it is marked as such rather than described as working.

**Related:** [`features.md`](features.md) is the feature inventory (what exists); this file is the narrative (how it is used). [`triage-model.md`](triage-model.md) explains the scoring. [`security.md`](security.md) explains the enforcement behind the boundaries in §6. [`testing.md`](testing.md) covers verification. [`project-status.md`](project-status.md) tracks shipped work, the current queue, and deferred items.

---

## The four roles

| Role | Signs in at | Scope |
|---|---|---|
| **Citizen** | `/login`, `/signup` | Their own reports, plus a city-wide ticket map |
| **MEO personnel** | `/admin/login` | MEO tickets and work orders only |
| **MDRRMO personnel** | `/admin/login` | MDRRMO tickets and work orders only |
| **System Administrator** | `/admin/login` | City-wide, plus admin management and the activity log |

**A note on `officer` vs `supervisor`:** both exist as roles and both must have an office, but **they carry no behavioral difference in the system today**. Every permission check distinguishes only *system admin* from *office admin*. The two office roles are a record-keeping distinction, not an access-control one. If a future requirement needs them to differ, that is new work.

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
3. **Confirm or place the pin.** Moving the pin more than 100 m from the photo's GPS shows a warning that the submission will be flagged for review. **It does not block submission** — the citizen can still file it.
4. **Choose a category** (11 options) and **a severity** — Low, Medium, High, or Critical. This is the citizen's own judgement of how bad it is.
5. **Submit.**

Behind the scenes the server recomputes everything it will not take on trust: which barangay the point falls in, the elevation from the DEM, and the integrity flags. It also decides whether this report is a new ticket or joins an existing one (§1.3).

**Rate limits apply** and will surface as a clear message: 5 reports per hour per account, and 3 within 25 m of each other per 24 hours. The second exists to stop the same pothole being filed ten times.

### 1.3 Tracking a report

- **`/reports`** lists the citizen's own reports with category, barangay, status, and which office is handling it. A first-time account sees an empty state with a "Report Hazard" prompt.
- **`/dashboard/reports/[id]`** shows one report's timeline, beginning with "Report submitted", and its current status.

Two situations get their own explanation on that page:

- **Merged into an existing ticket.** If the report matched a nearby recent one, the page says *"Merged with an existing issue"* and *"Grouped with N other report(s)."* The citizen is told their report joined a group — not that it was rejected or ignored.
- **Held for review (quarantined).** If an admin quarantines the report, the citizen sees a deliberately neutral banner: the report *"needs another look before it appears on the public map"*, and explicitly that **this does not affect the ticket's progress**. The admin's internal reasoning for the quarantine is never shown.

### 1.4 When the work is done

Once the ticket reaches **Resolved**, the report page gains two cards:

- **Case Closure Summary** (read-only) — the date it was resolved, the staff's completion notes, the staff's resolution photo, and a recap of the citizen's own feedback once given.
- **Resolution Feedback** (the action) — two buttons:
  - **Confirm Fixed** — recorded permanently and survives reload. No office notification, because a confirmation needs no action.
  - **Report Still Not Fixed** — asks "What's still wrong?", records the reason, **notifies the assigned office**, and marks the ticket as disputed in the admin queue.

Only one outstanding dispute per ticket. A dispute never moves the status backwards and never changes any score — it is a flag for staff attention, not a re-opening.

### 1.5 Notifications and the map

- **Notifications** arrive in a bell and link straight to the relevant report. Citizens receive: report received, report merged, report quarantined, flagged as duplicate, and each status change (under review, in progress, resolved).
- **`/map`** shows city-wide ticket pins over the municipal boundary. It requires a citizen session — it is city-wide in *content*, not open to the public.

**What a citizen never sees:** work orders, internal staff notes, moderation reasoning, the urgency factor breakdown, the priority index, or anyone else's report details.

---

## 2. MEO personnel flow

MEO handles the built-environment backlog.

### 2.1 Categories that reach MEO

Pothole, Uneven Sidewalk, Streetlight Out, Leaking Pipe, Uncollected Garbage, Illegal Dumping, Overgrown Vegetation, and Other. Routing is automatic by category — nobody assigns tickets manually on arrival.

### 2.2 A working session

**Log in** at `/admin/login`. Sessions last 8 hours — roughly one shift.

**The dashboard (`/admin`)** opens on MEO's numbers only. No toggle exists to see MDRRMO's, because there is nothing to toggle. Useful sections in practice:

- **Needs Attention** — overdue work orders, work due today, and high-urgency tickets that still have no real progress. This is the "what did I miss" panel.
- **Office Performance Summary** — pending / in progress / overdue / completed-this-week work orders, high-urgency open tickets, flagged reports waiting.
- **Map Presets** — one-click into a pre-filtered map: Drainage Issues, Potholes & Road Damage, Illegal Dumping, High-Urgency Open Work.

**The Ticket Queue (`/admin/tickets`)** is the main triage surface, sorted by urgency by default. Filter by status, urgency, category, barangay, free text, or "Disputed only". Every filter is reflected in the URL, so a filtered view is a link that can be sent to a colleague. Works on a phone — the table becomes cards below tablet width.

**Ticket Detail** is where the actual decision happens:

- Status, assigned office, urgency badge at the top.
- **Urgency decomposition** — the three factors with their explicit weights and contributions, not just a final number. See [`triage-model.md`](triage-model.md) for what those factors mean and their limits.
- **Priority breakdown** — a *separate* score based on citizen severity, ticket age, and how busy the barangay is.
- **Evidence & reports** — every citizen report merged into this ticket, with photos and integrity flags.
- **Location** — map, barangay, coordinates, elevation.
- **Work Orders panel** — create and manage the actual field work.

### 2.3 Moving a ticket forward

One button advances the status: **Reported → Under Review → In Progress → Resolved.**

The final step is different. "Advance to Resolved" opens a dialog that asks for **completion notes** and accepts a **resolution photo**. That photo and those notes are what the citizen later sees in their Case Closure Summary, so they are written for a public audience, not as internal shorthand. After Resolved there is no further transition.

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

**One thing MEO *can* do that is often assumed otherwise: reassign a ticket to MDRRMO.** Any admin who can access a ticket can hand it to the other office — useful when a "pothole" turns out to be a drainage failure. It is a **one-way hand-off**: once reassigned, the ticket is MDRRMO's and MEO can no longer open it or take it back. Every reassignment is recorded in the audit trail with who did it.

---

## 3. MDRRMO personnel flow

MDRRMO handles hazard and disaster-risk incidents. **The interface is identical to MEO's** — same dashboard, queue, detail page, work orders, map, insights, exports, notifications, and the same 8-hour session. Only the data differs. This section covers what is genuinely different.

### 3.1 Categories that reach MDRRMO

Three: **Flooding, Clogged Drain, Fallen Tree.** A smaller set than MEO's, but the categories most tied to weather and terrain — which is why the urgency model matters more here in practice.

### 3.2 Where the emphasis differs

**Urgency triage carries more weight for MDRRMO.** The urgency score combines low-lying terrain, current rainfall, and how many people have reported the same thing. During heavy rain the whole queue shifts upward and low-lying clusters rise to the top. That behaviour is the system's main decision-support claim.

Two honest caveats staff should understand, both detailed in [`triage-model.md`](triage-model.md):

- **Rainfall is a single city-wide reading**, not per-location. It moves every ticket's score together — it can tell you *the city is in a dangerous condition right now*, but it cannot tell you which of two tickets is more rain-exposed.
- **Elevation is absolute height**, not modelled water flow. A genuine local depression that happens to sit high in the municipality will not score as low-lying.

Treat the score as a **ranking aid that shows its work**, not as a calibrated risk probability. The factor breakdown on Ticket Detail exists so a decision can be sanity-checked rather than taken on faith.

**Map Presets** for MDRRMO go to Flooding Reports, Fallen Trees, and High-Urgency Reports.

**Barangay Insights** is more useful here than for MEO: repeated flooding in one barangay shows as a pattern across the 30-day trend and category breakdown, with elevation range shown as context. Note elevation is **display only** — it is not a filter, and no elevation-based map filter exists (deferred; see [`project-status.md`](project-status.md) §5).

### 3.3 Everything else

Status workflow, resolution with notes and photo, work orders, notifications, and exports all behave exactly as in §2.3–§2.5, scoped to MDRRMO.

### 3.4 What MDRRMO cannot do

The mirror image of §2.6 — no access to MEO tickets or work orders (403 on direct access, omitted from lists), no Admin Management, no Activity Log. Enforcement is tested in **both** directions, not just one.

MDRRMO can likewise hand a ticket to MEO, one-way, with the same audit trail.

---

## 4. System Administrator flow

Oversight and account administration — **not** a third operational desk.

### 4.1 City-wide visibility

Every office-scoped surface gains an **office picker**, defaulting to all offices: dashboard, ticket queue, work orders, map, barangay insights, exports. The dashboard adds a **MEO vs MDRRMO comparison** that office admins never see.

### 4.2 Ticket reassignment

System Administrators can reassign any ticket in either direction, without the one-way limitation office admins hit — because they can still see the ticket afterwards. This is the intended path for correcting a mis-routed ticket after the fact.

### 4.3 Admin management (`/admin/admins`)

Exclusive to this role:

- **Create** an admin — email, name, role, office. `officer` and `supervisor` require an office; `system_admin` must have none.
- **Change** role or office.
- **Deactivate / reactivate.** Deactivation is immediate and total: the admin cannot log in, and **any session they currently hold dies within the request cycle** rather than lingering until its 8-hour expiry. Reactivation restores access with the same password.
- **Reset another admin's password**, which takes effect immediately and invalidates that admin's other sessions.

Two guardrails worth knowing:

- **The last active System Administrator cannot be deactivated.** The system refuses to lock itself out of its own administration.
- **A System Administrator cannot reset their own password through Admin Management.** They use their own Account & Security page, which requires the current password.

### 4.4 Activity Log (`/admin/activity-log`)

The audit trail: account creation, role changes, deactivations, ticket status changes and reassignments, report moderation, and the full work-order lifecycle. Filterable by target type.

Three properties that matter for oversight:

- **Written in the same transaction as the action itself** — if the audit write fails, the action rolls back. The trail is load-bearing, not best-effort.
- **The actor's name, role, and office are snapshotted at write time**, so history reads correctly even after that admin is later edited.
- **Field *names* are logged, never contents** — you can see that a work order's notes changed, never what they said.

**Not audited:** CSV exports (read-only, with no single target to attach an event to) and login events. Login auditing is a known gap tracked in [`security-hardening-plan.md`](security-hardening-plan.md).

### 4.5 What a System Administrator should not do

Not restrictions the code enforces — operational guidance:

- **Do not use it as a daily triage account.** Its city-wide view makes office ownership ambiguous; work should be done from the office account that owns it, so the audit trail reflects who actually decided.
- **Do not treat the office picker as an office assignment.** It is a view filter, nothing more.
- **Keep the number of these accounts small.** They bypass every office boundary in the system.

---

## 5. End-to-end scenario

A flooded road in Barangay Cangatba, during the rainy season.

**1 — Maria reports it.** Standing at the edge of the water, she opens `/report`, photographs the flooded stretch, and the app reads the photo's GPS and confirms it is inside Porac. She picks **Flooding**, marks severity **High**, and submits.

**2 — The system processes it.** The server resolves the point to Cangatba, looks up the elevation from the DEM, checks the photo for integrity problems (none — fresh photo, GPS matches the pin), and searches for a nearby recent Flooding ticket. There is one, filed 40 minutes earlier by a neighbour. Maria's report **merges into it**, and the ticket's member count rises to 4.

Maria's report page shows *"Merged with an existing issue — grouped with 3 other reports."* She gets a notification. Because Flooding routes to MDRRMO, the ticket sits in their queue.

**3 — Urgency is computed.** Low-lying ground, live rainfall near the torrential threshold, four reports clustered together — the ticket scores into the **Critical** band. Crossing into Critical fires a `ticket_critical` notification to MDRRMO.

**4 — MDRRMO picks it up.** Ronald opens `/admin` at the start of his shift; the ticket is near the top of an urgency-sorted queue and appears under Needs Attention. On Ticket Detail he reads the four photos, checks the urgency breakdown (low elevation and heavy rain, not just a noisy cluster), and advances the status to **Under Review**, then **In Progress**. Maria gets a notification at each step.

**5 — Field work.** Ronald creates a work order — *"Clear blocked drainage inlet, Cangatba main road"* — assigns it to a colleague, sets tomorrow's due date, and later adds the internal note *"Inlet blocked by construction debris; coordinated with MEO for hauling."* **Maria never sees any of that.** He moves the work order to *in progress*, then *completed* — which does **not** advance the ticket. That stays a human decision.

**6 — Resolution.** Once the water has cleared, Ronald clicks "Advance to Resolved". The dialog asks for completion notes and a photo. He writes *"Drainage inlet cleared and flushed. Road passable."* and attaches a photo of the cleared road.

**7 — Maria sees the outcome.** Her report page now shows a **Case Closure Summary**: the date, Ronald's notes, and the after photo — followed by two buttons.

**8a — It worked.** She taps **Confirm Fixed**. It is recorded permanently. No one is paged.

**8b — Or it did not.** If the water returns the next day, she taps **Report Still Not Fixed** and writes why. That notifies MDRRMO, marks the ticket **Disputed** in their queue with a badge and a filter, and shows Ronald her reason on Ticket Detail. The status does not roll back and no score changes — it is a flag for human attention.

**Meanwhile,** if the ticket had sat at "In Progress" for a week with no work order ever reaching in-progress or completed, the nightly escalation job would have flagged it to MDRRMO once — a safety net against tickets quietly ageing out of view.

---

## 6. Boundaries and data visibility

The four rules that define who sees what. Enforcement details are in [`security.md`](security.md); this is what they mean in practice.

**1 — Citizens and admins are separate systems.** Not just separate pages: separate sessions, separate cookies, separate API routes. A citizen account cannot reach an admin route by any URL, and vice versa.

**2 — Office scoping comes from the session, never the request.** An MEO admin who edits the URL to ask for MDRRMO data gets MEO data. Lists silently narrow; direct access to another office's ticket or work order returns 403. Tested in both directions.

**3 — System Administrators see city-wide** — the only role that can, and the only role reaching Admin Management and the Activity Log.

**4 — Internal content never reaches citizens.** Work orders, work-order notes, moderation reasoning, and a citizen's own dispute reason are staff-only. This is structural, not cosmetic: citizen response types have no work-order fields at all, and the CSV export never even selects the notes column. There is a regression test that plants a sentinel note and asserts it never appears on the citizen's page.

**Citizens do see** their own reports and, on the map, city-wide ticket pins. They see an urgency **band** on their report — a coarse Low/Medium/Critical label — but never the factor breakdown or the numeric scores.

---

## 7. Pending and deferred

Not implemented. Listed so no one plans a workflow around them.

- **Login attempt throttling and security headers — pending.** See [`security-hardening-plan.md`](security-hardening-plan.md).
- **No citizen-facing work-order visibility**, not even a summary. Deliberate, and would need an explicit product decision.
- **No elevation-based map filter** — elevation is display-only.
- **`officer` and `supervisor` behave identically.** Any workflow distinction between them would be new work.
- **Deferred product ideas** — crew scheduling, attachments and checklists, inspection logs, a due-date calendar, barangay editing, PDF export, scheduled reports. See [`project-status.md`](project-status.md) §5.
