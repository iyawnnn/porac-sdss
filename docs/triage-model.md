# Triage & Scoring Model

**What the system actually computes today** — read from the code, not from the design intent. Where the implementation is narrower than the project's framing, this document says so rather than smoothing it over.

For developer onboarding, QA, and capstone defense. If you are preparing to answer "how does the system decide what to look at first," §4, §5, §8 and §10 are the sections that matter.

**Nothing here proposes a change.** The formula and constants below are described exactly as implemented. See §11 before altering any of them.

**Primary sources:** `api/src/common/utils/scoring.ts`, `api/src/domain/operational-priority.service.ts`.

---

## 1. The headline: one computed score

The manuscript's decision support has three components. Only one of them is a computed score:

| Component | What it is | Status |
|---|---|---|
| **Operational Priority** (`priority_index`) | System-computed administrative queue order — how soon staff should act | **Live** — this document |
| **Operational Assessment** (`operational_assessments`) | Human-entered: observed conditions, safety implications, recommended action | Live (five-role Batch 3). No score, level or band |
| **Hazard Information** (`hazard_information`) | DENR-MGB flood / rain-induced-landslide susceptibility for the ticket's location — advisory context only, in the source's own terms | Live (Phase 4, step 4b; `docs/database.md`). Never a score and never an input to `priority_index` |

The manuscript states that the system produces no "risk, urgency, severity, or numerical hazard score." The former **Hazard Urgency** score (elevation + rainfall + cluster) was retired in manuscript revision Phase 1 — see §12.

| | `priority_index` |
|---|---|
| **Question it answers** | How soon should staff act on this ticket? |
| **Inputs** | **Citizen severity**, ticket age, barangay demand |
| **Weights** | 0.5 / 0.25 / 0.25 |
| **Source** | `api/src/common/utils/scoring.ts` (frontend display copy: `lib/utils/scoring.ts`) |
| **Scale** | 1–100 |
| **Where shown** | Ticket Queue score/sort, Ticket Detail header and breakdown, admin map rings/popup/heatmap, dashboard "Highest Priority Actions", Work Orders list badge, Barangay profile recent-tickets badge, Focal Intake (dashboard, queue, detail, map), ticket CSV. **Never shown to citizens.** |

---

## 2. Terminology

| Term | Column(s) | Origin | Meaning |
|---|---|---|---|
| **Severity** | `reports.citizen_severity` | **Citizen input** | Low / Medium / High / Critical, chosen by the reporter. Never computed. Validated by `SEVERITIES` in `api/src/contracts/schemas.ts`. |
| **Operational Priority** | `tickets.priority_index` | **System-computed** | Administrative queue order (§4). Labeled "Operational Priority" (or "Op. Priority" in tight columns), never bare "Priority". |
| **Operational Assessment** | `operational_assessments` | **Staff input** | The human decision-support layer. Carries no score. |
| **Status** | `tickets.status` | **Admin workflow** | `Reported → Under Review → In Progress → Resolved`, plus `Rejected`. Not a score and never derived from one. `Reported`/`Under Review`/`In Progress`/`Resolved` advance via `NEXT_STATUS` (`api/src/admin/ticket-constants.ts`); `Rejected` is a separate terminal outcome reachable from any of the first three via `TicketsService.rejectTicket`, not a `NEXT_STATUS` entry — see `docs/features.md`'s Ticket Detail section. |
| **Dispute** | `disputed_at`, `dispute_reason` | **Citizen action** | Feedback on a resolved ticket. Feeds no score, never rolls status back. |
| **Work order status** | `work_orders.status` | **Admin workflow** | A fourth, independent track (`pending`/`in_progress`/`completed`/`cancelled`). Deliberately not coupled to ticket status or any score. |

---

## 3. Data inputs

| Input | Source | Per-ticket? | Notes |
|---|---|---|---|
| **Citizen severity** | The **median** Severity Factor of the ticket's member reports (`ticketSeverity`, `api/src/common/utils/severity.ts`) | **Yes** | Manuscript pp. 73–74 (Phase 4, step 4a; it was `MAX` before). Member reports = every report linked to the ticket (`reports.ticket_id`): a removed or regrouped report has moved, a merged-away ticket's reports have moved to its survivor, and moderation (dismissed / quarantined / duplicate) does not remove a report. For an even count the mean of the two middle factors, so the factor can fall between levels (0.375 / 0.625 / 0.875); it is used exactly. |
| **Ticket age** | `tickets.created_at` | **Yes** | Saturates at 7 days. |
| **Barangay demand** | Count of active tickets in the same barangay, normalized against the busiest barangay | **Yes** | Relative to the current active set. |
| **Category** | `tickets.category` | Yes | **Not a scoring input.** Determines office routing (`office.ts`) only. |

### 3.1 Missing-data behavior

| Missing | Behavior | Assessment |
|---|---|---|
| **Citizen severity** | A ticket with no linked report (not reachable through the app) counts as `Low`; an unknown value counts as `Low`. | Reasonable default, unchanged from the MAX rule. |
| **`created_at` unparseable** | `ageFactor` falls back to 0. | Defensive; should never happen for a real row. |
| **No active tickets at all** | `maxActiveBarangayCount` is 0, so `spatialFactor` falls back to 0 rather than dividing by zero. | Correct. |

---

## 4. The formula, exactly as implemented — `api/src/common/utils/scoring.ts`

```
severityFactor = median over the ticket's member reports of { Low: 0.25, Medium: 0.5, High: 0.75, Critical: 1.0 }
                 (even count: mean of the two middle factors; one report: its own factor)
ageFactor      = clamp01( (now − createdAt) / 7 days )
spatialFactor  = clamp01( activeBarangayCount / maxActiveBarangayCount )

weighted      = 0.50·severityFactor + 0.25·ageFactor + 0.25·spatialFactor
priorityIndex = clamp( 1, 100, round(1 + weighted × 99) )
```

The median is taken in `api/src/common/utils/severity.ts` (`ticketSeverity`, Phase 4 step 4a) and passed to `computePriorityBreakdown` as `severityFactor`, so it is exact even between two levels. The label shown beside it is derived: the nearest level, and exactly halfway (0.375 / 0.625 / 0.875) rounds **up**. All three factors are clamped. Age saturates at 7 days — the manuscript uses 7 days only as this age cap, never as an escalation rule (the 7-day escalation job was removed in manuscript revision Phase 1, step 2). Barangay demand is normalized against the busiest barangay in the current active set, so it is **relative and moves as the queue changes**, not an absolute measure.

`computePriorityBreakdown` also returns each factor multiplied by its weight (`severityContribution`, `ageContribution`, `spatialContribution`), which is what the Ticket Detail "Operational Priority" card shows.

---

## 5. Display band

`priority_index` is stored as a raw 1–100 number with **no stored band**. The UI adds a Low / Medium / High display band in thirds — 1–33 / 34–66 / 67–100 — from `lib/utils/ui/priority.ts` (`priorityBandLabel`, `priorityBandClass`, `priorityBandHex`). That band is **a UI convention, not a manuscript-defined threshold**: it is never stored, never used to filter or count tickets, and the CSV export carries the number only. This is why the admin overview screens show no "High priority" counts (manuscript revision Phase 1, step 6a).

---

## 6. Where the score appears

| Surface | Shows |
|---|---|
| **Ticket Queue** (`TicketsWorkspace.tsx`) | `priority_index` in the "Op. Priority" column with its display band in "Level"; the default and only score sort is Operational Priority (`op_priority_desc`/`op_priority_asc`). The KPI tiles "High priority" (≥ 67, this page) and "Avg. priority" use the same values |
| **Ticket Detail** (`app/admin/tickets/[id]`) | Header badge with the display band; the Scoring tab's Operational Priority card shows the factor table (severity / age / barangay demand) while the ticket is active |
| **Admin Map** (`MapClient.tsx`, `TicketPopup.tsx`) | Marker and cluster rings, legend and popup use the display band; heatmap intensity is `priority_index` |
| **Dashboard** | The "Highest Priority Actions" table ranks by `priority_index`. No band counts (§5) |
| **Work Orders / Barangay Insights** | The linked ticket's Operational Priority badge per row (Work Orders list; Barangay profile recent tickets) |
| **Focal Intake** (`components/features/admin/focal/`) | Dashboard and Intake Queue "Op. Priority" columns, intake detail header badge and Decision Support card, Focal map pins and popup |
| **CSV export** | An "Operational Priority" column (`priority_index`, the raw number) |
| **Citizen views** (`app/(citizen)/**`) | **Nothing.** Citizens are shown no system score — see §10.3 |

**Frontend/backend consistency.** `lib/utils/scoring.ts` is a duplicate of `api/src/common/utils/scoring.ts` (identical apart from quote style and line wrapping). The frontend copy exists for display only and is never authoritative.

---

## 7. Recalculation

### What recalculates

`OperationalPriorityService.recalculateActiveTickets` (`api/src/domain/operational-priority.service.ts`) writes only `priority_index`, using the §4 formula. The seed scripts use `api/scripts/lib/recompute.ts`'s `recalculateActivePriority`, which runs that same service. `recalculateTickets(tx, ids)` is the same calculation limited to given tickets inside a caller's transaction. `pnpm --prefix api recalc:median-severity` (`api/scripts/recalculate-median-severity.ts`, dry run unless `--apply`) recalculated every active ticket once when the median rule arrived.

**Only tickets with status `Reported`, `Under Review`, or `In Progress` are updated.** `Resolved` and `Rejected` tickets keep whatever value they last held — their priority is effectively frozen at closure.

### When it runs

| Trigger | Mechanism |
|---|---|
| **On demand** | `GET /admin/dashboard`, `/admin/tickets`, `/admin/tickets/:id`, `/admin/tickets/geo` — an admin loading these pages triggers a recalculation |
| **After citizen submission** | `ReportsService.submit`, post-commit (outside the submission transaction) |
| **Merge / remove / regroup / location correction** | The changed tickets inside the action's own transaction (`recalculateTickets`: the survivor; the old and new ticket; both tickets; the corrected ticket), then every active ticket after the commit (Phase 4, step 4a). A category correction changes no membership and recalculates nothing. |
| **Daily cron** | `POST /cron/recompute-priority` (returns `{ operationalPriorityUpdated }`), called by `.github/workflows/cron.yml` at 18:00 UTC (02:00 Manila), behind `CronSecretGuard` |

The cron job is a safety net for periods with no admin activity, so age keeps advancing — see `docs/deployment-readiness.md` §6.

### Determinism

| Deterministic | Non-deterministic |
|---|---|
| `severityFactor` — fixed mapping | `ageFactor` — advances with wall-clock time |
| | `spatialFactor` — relative to the current active set |

**Two identical reports submitted a week apart will not score identically.** Age and queue composition both move. This matters when reproducing a score during QA (§9).

---

## 8. Alignment with the project's framing

Engineering assessment only — no academic rewriting.

### Fully aligned

- **The Operational Priority formula** — 0.50 severity + 0.25 age (capped at 7 days) + 0.25 barangay demand — is implemented as the manuscript describes it.
- **Citizen severity drives the queue order.** It carries half the weight of `priority_index`.
- **No hazard or risk score is produced.** Hazard Urgency was removed in manuscript revision Phase 1 (§12); Hazard Information (Phase 4) is advisory context, not a score.
- **Category-based office routing** works as described, and also classifies each category as the assigned office's direct responsibility or a Referral/coordination concern — see [`features.md`](features.md) §1 and [`database.md`](database.md)'s `tickets.category`/`assigned_office` notes.

### Partially aligned — state carefully

- **"MCDA-style multi-criteria scoring."** Defensible in structure — weighted, normalized criteria — but the weights are **fixed constants that have never been elicited from stakeholders or validated** (`PLAN.md` §15 Q4, still open). No AHP, no pairwise comparison, no sensitivity analysis exists. Describe it as *a weighted linear model with provisional weights*, not as a validated MCDA instrument.
- **Severity aggregation.** Since Phase 4, step 4a the ticket's Severity Factor is the median of its member reports (manuscript pp. 73–74): Low + High + Critical → 0.75, Medium + Critical → 0.75, one report → its own factor. A single Critical no longer dominates; it stays visible on Ticket Detail. The displayed label is derived (nearest level, halfway rounds up) and never stored; there is no ticket severity column.

### Not implemented

- **Admin-configurable weights** — `PLAN.md` §15 Q4, still open. Weights are hardcoded.
- **Human-confirmed grouping** — returns in Phase 3; the system will suggest possibly related tickets within 20 / 50 / 100 m and only staff confirm a merge.

---

## 9. QA checklist — verifying a ticket's score by hand

1. **Read the inputs.** From the database you need the ticket's `created_at`, its reports' `citizen_severity` (take the median factor; for an even count the mean of the two middle ones), and the active-ticket counts per barangay (`status IN ('Reported', 'Under Review', 'In Progress')`).
2. **Compute by hand** using §4. Barangay demand is this ticket's barangay count divided by the busiest barangay's count.
3. **Cross-check the stored value.** `GET /admin/tickets/:id` returns `priority_index`; its `priority-context` endpoint returns the breakdown, and each contribution should equal its factor × weight.
4. **Cross-check the surfaces.** The same ticket must show the same number and band on the Ticket Queue, Ticket Detail, admin map popup and Focal Intake. They all read the same stored column.

**Pitfalls that will make hand-verification fail for non-bug reasons:**

- Loading an admin page triggers a recalculation; age moves between your read and your check.
- `spatialFactor` shifts as other tickets open and close.
- Resolved and rejected tickets are not recalculated at all (§7).

**Automated coverage today:** `api/src/common/utils/severity.spec.ts` (the median rule, labels and ties), `api/src/common/utils/scoring.spec.ts` (range, weights, directional response to severity/age/demand, the exact median factor), `api/src/domain/operational-priority.service.spec.ts` (only active tickets, only `priority_index` written) and `lib/utils/scoring.test.ts` (the frontend copy, run with Node's test runner).

---

## 10. Known limitations

Stated plainly. None of these is a defect to fix casually.

### 10.1 Weights are provisional and unvalidated

0.5 / 0.25 / 0.25 was chosen as a reasonable default, not derived from stakeholder elicitation or outcome data. The code and `PLAN.md` §15 both say so. **Do not present it as validated.**

### 10.2 Barangay demand is relative

`spatialFactor` is normalized against the busiest barangay in the current active set, so a ticket's priority can move when a ticket in a *different* barangay opens or closes. It ranks tickets against each other; it is not an absolute measure of demand.

### 10.3 Precision is presented more confidently than it is warranted

`priority_index` renders as a precise integer (e.g. "73"). Given §10.1 and §10.2, that number carries **far less precision than two significant figures implies** — the difference between 71 and 73 is not meaningful. Ticket Detail's factor breakdown mitigates this for admins by showing the inputs. Citizens are shown no system score at all — no Hazard Urgency since manuscript revision Phase 1, step 6c, and never Operational Priority.

Be careful not to describe the score as a calibrated risk probability. It is a **transparent, reproducible ranking heuristic** — genuinely useful for triage, and a more defensible claim.

### 10.4 The display band is not a threshold

The Low / Medium / High band (§5) is a display convention. Do not describe "High priority" as a manuscript-defined category, and do not build counts, alerts or filters on it without a product decision.

---

## 11. Change-control rule

The scoring model is part of the project's research contribution. Changing it casually breaks reproducibility and invalidates any prior analysis.

**Any change to the formula, a weight, or a saturation constant must update all of these in the same change:**

1. **Backend** — `api/src/common/utils/scoring.ts`
2. **Frontend duplicate** — `lib/utils/scoring.ts`. An intentional copy; **letting it drift silently breaks display consistency** with no test to catch it.
3. **Seed helper** — `api/scripts/lib/recompute.ts` (uses `lib/utils/scoring.ts`, so it follows the frontend copy)
4. **Tests** — `api/src/common/utils/scoring.spec.ts`, `api/src/domain/operational-priority.service.spec.ts`, `lib/utils/scoring.test.ts`
5. **This document** — §4, §5, §8
6. **`docs/project-status.md`** — if user-visible behavior changes
7. **`CLAUDE.md`** — if the Operational Priority paragraph or the terminology section is affected
8. **A stored-value decision** — existing rows hold values from the old formula. Decide explicitly whether to recalculate (active tickets update on the next admin load anyway; closed ones do not) or accept mixed-vintage history, and record the choice.

**Requires a product/research decision before changing, not just a code review:**

- Any weight change (`PLAN.md` §15 Q4 is still open)
- Changing the severity aggregation (median since Phase 4, step 4a, per the manuscript)
- Turning the display band (§5) into a stored or counted threshold

---

## 12. Retired: Hazard Urgency (removed in manuscript revision Phase 1)

**What it was.** An environmental score stored on `tickets`: `urgency_score = ⅓·elevationFactor + ⅓·precipitationFactor + ⅓·clusterFactor`, where elevation was inverse-normalized against the city-wide `config.elev_min`/`elev_max` (from the SRTM DEM in `dem_points`), precipitation was a single city-wide OpenWeatherMap `rain["1h"]` reading capped at the PAGASA 30 mm/h torrential threshold, and the cluster factor was a log curve on `member_count` saturating at 10. It was restated as `priority_score` (0–100) and banded LOW / MEDIUM / HIGH at 50 / 80 (`urgency_level`, Title-Case `urgency_band`); crossing into HIGH created a `ticket_critical` notification.

**Why it was removed.** The manuscript's decision support is Hazard Information, Operational Priority and Operational Assessment, and it states the system produces no "risk, urgency, severity, or numerical hazard score." Hazard Urgency was also weak on its own terms: one city-wide rainfall reading shifted every ticket equally and never changed their order, and elevation was absolute height rather than local flow or depression.

**How it was removed.** Step by step in manuscript revision Phase 1: off the Ticket Queue, CSV and saved views (step 4, migration `0034`), Ticket Detail and the admin map (5), the admin overview screens (6a), Focal Intake (6b), the citizen pages (6c); then no longer calculated — the recompute service, formula, weather and elevation services and the cron routes `recompute-urgency`/`recompute-weather` were deleted and report submission stopped looking up elevation and rain (7a); finally the frontend helpers and seed-script remnants went (7b). See `docs/project-status.md` §3 for each step.

**What is left.** The columns `elevation_m`, `elevation_factor`, `precipitation_factor`, `cluster_factor`, `urgency_score`, `urgency_band`, `priority_score`, `urgency_level` (and `reports.elevation_m`) still exist with their old values; new rows leave them NULL. They, and the `config` table's `elev_min`/`elev_max`/`rain_1h_mm` rows, are dropped in Phase 8 — see `docs/database.md`. Existing `ticket_critical` notifications still render as history ("Ticket Urgency Became High"); nothing creates new ones.
