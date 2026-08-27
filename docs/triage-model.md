# Triage & Scoring Model

**What the system actually computes today** — read from the code, not from the design intent. Where the implementation is narrower than the project's framing, this document says so rather than smoothing it over.

For developer onboarding, QA, and capstone defense. If you are preparing to answer "how does your urgency score work," §4, §5, §8, and §10 are the sections that matter.

**Nothing here proposes a change.** The formulas and thresholds below are described exactly as implemented. See §11 before altering any of them.

**Primary sources:** `api/src/domain/urgency.ts`, `api/src/common/utils/scoring.ts`, `api/src/domain/recompute.service.ts`, `api/src/domain/weather.service.ts`, `api/src/domain/app-config.service.ts`.

---

## 1. The headline: there are two formulas, not one

This is the single most important thing to understand, and the most common source of confusion.

| | `urgency_score` | `priority_index` |
|---|---|---|
| **Question it answers** | How environmentally hazardous is this location right now? | How soon should staff act on this ticket? |
| **Inputs** | Elevation, rainfall, cluster size | **Citizen severity**, ticket age, barangay density |
| **Weights** | ⅓ / ⅓ / ⅓ | 0.5 / 0.25 / 0.25 |
| **Source** | `api/src/domain/urgency.ts` | `api/src/common/utils/scoring.ts` |
| **Scale** | 0–1, plus 0–100 restatements | 1–100 |
| **Where shown** | Ticket Queue sort/badge, Ticket Detail "Urgency", map | Ticket Detail "Priority breakdown", map heatmap intensity |

They share no term. **Citizen-reported severity does not appear in `urgency_score` at all** — it feeds only `priority_index`. See §8.

---

## 2. Terminology

Five distinct concepts. The first four are frequently conflated; the last is unrelated but often assumed to be part of the model.

| Term | Column(s) | Origin | Meaning |
|---|---|---|---|
| **Severity** | `reports.citizen_severity` | **Citizen input** | Low / Medium / High / Critical, chosen by the reporter. Never computed. Validated by `SEVERITIES` in `api/src/contracts/schemas.ts`. |
| **Urgency** | `urgency_score`, `urgency_band`, `priority_score`, `urgency_level`, and the three `*_factor` columns | **System-computed** | Environmental hazard. `priority_score` and `urgency_level` are *restatements of the same `urgency_score`*, not separate concepts — see §5. Labeled "Urgency" in the UI despite `priority_score`'s column name. |
| **Priority** | `priority_index` | **System-computed, different formula** | Workflow priority (§4.2). Unrelated to `urgency_score` despite sharing the word. |
| **Status** | `tickets.status` | **Admin workflow** | `Reported → Under Review → In Progress → Resolved`, plus `Rejected`. Not a score and never derived from one. `Reported`/`Under Review`/`In Progress`/`Resolved` advance via `NEXT_STATUS` (`api/src/admin/ticket-constants.ts`); `Rejected` is a separate terminal outcome reachable from any of the first three via `TicketsService.rejectTicket` (Phase 4 of the manuscript-alignment work), not a `NEXT_STATUS` entry — see `docs/features.md`'s Ticket Detail section. |
| **Dispute** | `disputed_at`, `dispute_reason` | **Citizen action** | Feedback on a resolved ticket. Feeds no score, never rolls status back. |
| **Work order status** | `work_orders.status` | **Admin workflow** | A fourth, independent track (`pending`/`in_progress`/`completed`/`cancelled`). Deliberately not coupled to ticket status or any score. |

---

## 3. Data inputs

| Input | Source | Per-ticket? | Notes |
|---|---|---|---|
| **Elevation** | `tickets.elevation_m`, from a nearest-neighbour lookup against `dem_points` (SRTM 30m DEM) at submission | **Yes** | Static. Never recomputed after submission; never accepted from the client. |
| **Elevation bounds** | `config.elev_min` / `elev_max` | No — city-wide | Fixed constants computed once at DEM seed time (`app-config.service.ts`). **Never recomputed live.** |
| **Rainfall** | OpenWeatherMap `rain["1h"]` mm | **No — one city-wide value** | Fetched at the *municipality centroid* (`MUNICIPALITY.centerLat/centerLng`), cached ~10 min in the `config` table. See §10.1 — this is the model's most significant limitation. |
| **Cluster size** | `tickets.member_count` | **Yes** | Incremented when a report merges into the ticket (§3.1). |
| **Citizen severity** | `MAX(citizen_severity)` across the ticket's reports | **Yes** | `priority_index` only. Merged tickets take the **highest** severity among their reports. |
| **Ticket age** | `tickets.created_at` | **Yes** | `priority_index` only. |
| **Barangay density** | Count of active tickets in the same barangay, normalized against the busiest barangay | **Yes** | `priority_index` only. |
| **Category** | `reports.category` | Yes | **Not a scoring input.** Determines office routing (`office.ts`) and the dedup merge radius (`radius.ts`) only. |

### 3.1 How cluster size is produced

A new report merges into an existing ticket when it falls within a category-specific radius of an active ticket created in the last 7 days (`duplicate-detection.ts`, `radius.ts`). Merging increments `member_count` and recomputes the ticket centroid — which is why urgency is scored on **tickets**, not reports.

### 3.2 Missing-data behavior

| Missing | Behavior | Assessment |
|---|---|---|
| **Rainfall** (API down/timeout) | Falls back to the stale cached value; if none has ever been cached, **0 mm**. Logged, never thrown. | Correct and deliberate — a weather outage must not 500 the admin dashboard. |
| **Rainfall** (not raining) | OpenWeatherMap omits the `rain` key; `?? 0` yields 0 mm. | Normal case, not an error. |
| **Citizen severity** | `COALESCE(severity_rank, 1)` → treated as `Low`. | Reasonable default. |
| **Elevation (`elevation_m` is NULL)** | **Not handled.** `elevation_m` is nullable in the schema, and `computeUrgency` does not guard it. JavaScript coerces `null` to `0` in `elevMax - elevationM`, producing an **elevation factor above 1.0** — the factor is never clamped — which inflates the ticket's urgency to *above* the maximum a real sea-level ticket could reach. | **A genuine edge case.** See §10.4. |

---

## 4. The formulas, exactly as implemented

### 4.1 Urgency — `api/src/domain/urgency.ts`

```
elevationFactor     = (elevMax − elevationM) / (elevMax − elevMin)
precipitationFactor = min(rain1hMm / 30, 1.0)
clusterFactor       = min( ln(1 + memberCount) / ln(1 + 10), 1.0 )

urgencyScore = (1/3)·elevationFactor + (1/3)·precipitationFactor + (1/3)·clusterFactor
```

- **Elevation** — inverse-normalized against city-wide bounds: lower ground scores higher. **Not clamped** to [0,1]; it relies on `elevationM` always falling within `[elevMin, elevMax]`, which holds when elevation comes from `dem_points` but not when it is NULL (§3.2).
- **Precipitation** — linear in millimetres, capped at **30 mm/h**, the PAGASA torrential threshold. 30 mm/h or more saturates the factor at 1.0.
- **Cluster** — logarithmic, saturating at **10 members**. Each additional duplicate contributes less than the last (diminishing informational value). `memberCount` is clamped to ≥ 0 before the log, so a corrupt negative count cannot produce `NaN` or `−Infinity`.
- **Weights are equal thirds, and the code says they are provisional**: *"Weights are provisional (1/3 each, pending MEO/MDRRMO consultation per PLAN.md §15)."* See §10.5.

### 4.2 Priority index — `api/src/common/utils/scoring.ts`

```
severityFactor = { Low: 0.25, Medium: 0.5, High: 0.75, Critical: 1.0 }
ageFactor      = clamp01( (now − createdAt) / 7 days )
spatialFactor  = clamp01( activeBarangayCount / maxActiveBarangayCount )

weighted      = 0.50·severityFactor + 0.25·ageFactor + 0.25·spatialFactor
priorityIndex = clamp( 1, 100, round(1 + weighted × 99) )
```

Age saturates at 7 days. Spatial density is normalized against the busiest barangay in the current active set, so it is **relative and moves as the queue changes**, not an absolute measure. Unlike the urgency factors, all three of these are clamped.

### 4.3 Derived restatements

Both computed in `urgency.ts`:

```
priorityScore             = round(urgencyScore × 100)                        // 0–100
environmentalUrgencyScore = round(((elevationFactor + precipitationFactor)/2) × 100)
```

`environmentalUrgencyScore` — elevation and rainfall only, excluding cluster — is **computed and unit-tested but never persisted or displayed anywhere.** It appears in no database column, no API response, and no component. Treat it as dead output rather than a third live metric.

---

## 5. Bands and labels

`urgency_band` and `urgency_level` are two casing variants of **one** banding scheme, both derived from the same `urgencyLevelFromScore` helper — `urgency_level` in the function's native UPPER form, `urgency_band` as a Title-Case restatement (`HIGH→'High'`, `MEDIUM→'Medium'`, `LOW→'Low'`). They can never disagree with each other or with the underlying `priority_score`:

| Column | Thresholds (on `priority_score`, 0–100) | Labels |
|---|---|---|
| `urgency_level` | `< 50` / `50–79` / `≥ 80` | LOW / MEDIUM / HIGH |
| `urgency_band` | Same thresholds, Title-Case restatement | Low / Medium / High |

Prior to Phase 2 of the manuscript-alignment work, `urgency_band` was computed independently on the raw 0–1 `urgency_score` with different cutoffs (0.4/0.7) and a third label of "Critical" instead of "High" — this was a real, documented discrepancy where the same ticket could show "Medium" band and "LOW" level simultaneously. That has been resolved by making `urgency_band` derive from `urgency_level` rather than compute its own threshold. "Critical" is no longer a Hazard Urgency label anywhere in the system — it remains a valid **citizen-reported severity** value (`reports.citizen_severity`), which is a separate concept (§2).

`priority_index` has no banding; it is displayed as a raw 1–100 number.

---

## 6. Where the score appears

| Surface | Shows |
|---|---|
| **Ticket Queue** (`TicketsWorkspace.tsx`) | `priority_score` as the sortable number, `urgency_level` as the badge; default sort is urgency-descending |
| **Ticket Detail** (`app/admin/tickets/[id]`) | Urgency decomposition with the three factors, their explicit ⅓ weights, and per-factor contributions; separately, a **Priority breakdown** card for `priority_index` |
| **Admin Map** (`MapClient.tsx`, `TicketPopup.tsx`) | Urgency-driven pin styling; heatmap intensity driven by `priority_index` |
| **Dashboard** | High-urgency counts; "Needs Attention" surfaces active HIGH-urgency tickets with unfinished work |
| **Barangay Insights** (`BarangayProfile.tsx`) | High-urgency ticket counts per barangay. Elevation min/avg/max is shown as **display-only context, never a filter or scoring input** |
| **CSV export** | Urgency band and priority score columns |
| **Citizen views** (`app/(citizen)/**`) | `urgency_band` only. Citizens never see the factor breakdown, `priority_index`, or `priority_score` — see §10.6 |

**Frontend/backend consistency was verified, not assumed.** `lib/utils/urgency.ts` and `lib/utils/scoring.ts` are duplicates of their `api/src` counterparts; a line-by-line diff shows they are **identical apart from quote style and line wrapping**. Same formulas, same weights, same thresholds, same saturation constants. The frontend copies exist for badge/label display only and are never authoritative.

---

## 7. Recalculation

### What recomputes

`RecomputeService.recomputeActiveTicketUrgency` (`api/src/domain/recompute.service.ts`) recomputes **both** models in one pass and writes eight columns: `elevation_factor`, `precipitation_factor`, `cluster_factor`, `urgency_score`, `urgency_band`, `priority_index`, `priority_score`, `urgency_level`.

**Only tickets with status `Reported`, `Under Review`, or `In Progress` are updated.** `Resolved` and `Rejected` tickets keep whatever values they last held — their scores are effectively frozen at resolution time. Historical scores in exports of closed tickets reflect the moment they were closed, not current conditions.

### When it runs

| Trigger | Mechanism |
|---|---|
| **On demand** | `GET /admin/dashboard`, `/admin/tickets`, `/admin/tickets/:id`, `/admin/tickets/geo` — an admin loading these pages triggers a recompute |
| **Daily cron** | `POST /cron/recompute-urgency` and `POST /cron/recompute-weather`, at 18:00 UTC (02:00 Manila), behind `CronSecretGuard` |

On-demand recompute is what makes the queue re-rank live during a storm. The cron jobs are a safety net for periods with no admin activity — see `docs/deployment-readiness.md` §6.

### Side effect: high-urgency escalation notifications

During recompute, a ticket whose band transitions **into** `High` from anything else generates a `ticket_critical`-typed office notification (the internal `type` string is unchanged from before the Phase 2 threshold fix — only the boundary value and the user-facing title/message moved from "Critical" to "High"). The check compares old and new state rather than using a "already notified" flag, so it is naturally idempotent — a ticket already at High compares High→High and notifies nothing.

### Determinism

| Deterministic | Non-deterministic |
|---|---|
| `elevationFactor` — static DEM value and fixed bounds | `precipitationFactor` — live external API |
| `clusterFactor` — a pure function of `member_count` | `spatialFactor` — relative to the current active set |
| `severityFactor` — fixed mapping | `ageFactor` — advances with wall-clock time |

**Two identical reports submitted a week apart will not score identically.** Rainfall, queue composition, and age all move. This matters when reproducing a score during QA (§9).

---

## 8. Alignment with the project's framing

Engineering assessment only — no academic rewriting.

### Fully aligned

- **The urgency formula matches the specification.** `PLAN.md` §7 records it as implemented exactly as written: three factors, equal ⅓ weights. Bands were originally set at 0.4/0.7 per that section; the current manuscript specifies 0.50/0.80, which is what `HAZARD_URGENCY_HIGH_THRESHOLD`/`HAZARD_URGENCY_MEDIUM_THRESHOLD` (§5) now implement.
- **Elevation** is genuine DEM-derived topographical exposure, inverse-normalized city-wide, server-computed and never client-trusted.
- **Spatial clustering** is real: PostGIS radius-based deduplication feeding a saturating log curve.
- **Rainfall** is real telemetry, capped at a defensible published threshold (PAGASA 30 mm/h).
- **Category-based office routing** works as described, and now also classifies each category as the assigned office's direct responsibility or a Referral/coordination concern (Phase 3 of the manuscript-alignment work) — see [`features.md`](features.md) §1 for the routing table and [`database.md`](database.md)'s `tickets.category`/`assigned_office` notes.

### Partially aligned — state carefully

- **"Citizen severity feeds urgency."** It does **not**. Severity carries 50% of `priority_index` and **0%** of `urgency_score`. If the project framing describes one urgency score incorporating citizen severity alongside elevation and rainfall, that is not what the code does. The accurate statement is: *two scores exist; severity drives the workflow-priority one.*
- **"MCDA-style multi-criteria scoring."** Defensible in structure — weighted, normalized criteria — but the weights are **fixed constants that have never been elicited from stakeholders or validated**. The code itself calls them provisional pending MEO/MDRRMO consultation (`PLAN.md` §15 Q4, still open). No AHP, no pairwise comparison, no sensitivity analysis exists. Describe it as *a weighted linear model with provisional equal weights*, not as a validated MCDA instrument.
- **"Rainfall-aware per-location scoring."** Rainfall is a **single city-wide reading**, identical for every ticket at any instant (§10.1). It is weather-aware, not spatially weather-aware.

### Not implemented

- **Downstream flow / D8 flow accumulation** — `PLAN.md` §15 Q3, still open. Not implemented. Elevation is absolute inverse-normalized height, **not** a hydrological flow or local-depression measure. `PLAN.md` §7 itself notes local-depression scoring (`elev − AVG(elevation within 200m)`) as a possible refinement and cites the city-wide normalization as a limitation.
- **Admin-configurable weights** — `PLAN.md` §15 Q4, still open. Weights are hardcoded.
- **Deduplication radius validation** — `PLAN.md` §15 Q5, still open. The 25/50/100 m tiers are unconfirmed with field crews.

---

## 9. QA checklist — verifying a ticket's score by hand

1. **Read the inputs.** `GET /admin/tickets/:id` returns the stored factors. From the database you need `elevation_m`, `member_count`, `created_at`, and the ticket's reports' `citizen_severity`.
2. **Get the city-wide constants.** `pnpm --prefix api verify:config` prints `elev_min` / `elev_max`. Read the current rainfall from the `config` table's `rain_1h_mm` row — **use the cached value, not a fresh API call**, or your arithmetic will not match.
3. **Compute by hand** using §4.1. Check each factor against the stored `elevation_factor` / `precipitation_factor` / `cluster_factor` columns before checking the composite.
4. **Verify the derivations.** `priority_score == round(urgency_score × 100)`, and `urgency_level`/`urgency_band` follow the 50/80 thresholds on that number (§5) — they should always agree with each other.
5. **Cross-check the surfaces.** The same ticket must show the same number and badge on the Ticket Queue, Ticket Detail, and map popup. They all read the same stored columns.
6. **Confirm the factor contributions sum correctly** on Ticket Detail — each displayed contribution is its factor × ⅓.

**Pitfalls that will make hand-verification fail for non-bug reasons:**

- Loading an admin page triggers a recompute; values can change between your read and your check.
- Rainfall changes every ~10 minutes.
- `spatialFactor` and `priority_index` shift as other tickets open and close.
- Resolved tickets are not recomputed at all (§7).

**Automated coverage today:** `api/src/domain/urgency.spec.ts` (11 cases — thresholds, level/score consistency, band/level agreement, and thorough cluster-factor edge cases including 0, saturation, overflow, negative input, and monotonicity) and `api/src/common/utils/scoring.spec.ts` (2 cases — range, and directional response to severity/age/density). **There is no test for elevation-factor edge cases**, including the NULL case in §10.4.

---

## 10. Known limitations

Stated plainly. None of these is a defect to fix casually; several are inherent to the data available.

### 10.1 Rainfall has no spatial discriminating power

One reading, taken at the municipality centroid, applied identically to every ticket. Because `precipitationFactor` is the same for all tickets at any instant, it **shifts every score up or down uniformly and never changes their relative ordering**.

Practically: rainfall can push the whole queue across the High threshold during a storm — which is useful and intended — but it can never tell you *which* of two tickets is more rain-exposed. Any claim that the system scores per-location rainfall exposure would be inaccurate. Fixing it would need a gridded precipitation source, which OpenWeatherMap's free tier does not provide at intra-municipal resolution.

### 10.2 Elevation is static and absolute

Captured once at submission from a 30 m SRTM DEM and never revisited. It measures absolute height inverse-normalized across the whole municipality, **not** local depression or flow accumulation — water pools in local lows, which this does not capture. `PLAN.md` §7 acknowledges this as a limitation.

### 10.3 ~~Two banding schemes disagree~~ — resolved

Previously, `urgency_band` and `urgency_level` were computed independently with different thresholds and could disagree at the boundary. As of Phase 2 of the manuscript-alignment work, `urgency_band` derives from `urgency_level` (§5) — they cannot disagree anymore. Kept here as a resolved-item marker rather than deleted outright, since exports/screenshots/QA notes from before the fix may still reference the old behavior.

### 10.4 NULL elevation inflates urgency

`tickets.elevation_m` is nullable and `elevationFactor` is unclamped, so a NULL produces a factor above 1.0 and a ticket that outranks genuine sea-level reports. This occurs when `dem_points` is unseeded — which is exactly why the DEM seed is listed as non-optional in `docs/deployment-readiness.md` §4. Untested (§9).

### 10.5 Weights are provisional and unvalidated

⅓/⅓/⅓ for urgency and 0.5/0.25/0.25 for priority were chosen as reasonable defaults, not derived from stakeholder elicitation or outcome data. The code and `PLAN.md` §15 both say so. **Do not present them as validated.**

### 10.6 Precision is presented more confidently than it is warranted

`priority_score` and `priority_index` render as precise integers (e.g. "73"). Given §10.1, §10.2, and §10.5, that number carries **far less precision than two significant figures implies** — the difference between 71 and 73 is not meaningful. Ticket Detail's factor breakdown mitigates this for admins by showing the inputs. Citizens see only `urgency_band`, a coarser and more honest three-way label, which is the right choice.

Be careful not to describe the score as a calibrated risk probability. It is a **transparent, reproducible ranking heuristic** — which is genuinely useful for triage, and a more defensible claim.

### 10.7 Environmental urgency score is dead output

`environmentalUrgencyScore` is computed and tested but never stored or displayed (§4.3).

---

## 11. Change-control rule

The scoring model is the project's core research contribution. Changing it casually breaks reproducibility and invalidates any prior analysis.

**Any change to a formula, weight, threshold, or saturation constant must update all of these in the same change:**

1. **Backend** — `api/src/domain/urgency.ts` and/or `api/src/common/utils/scoring.ts`
2. **Frontend duplicates** — `lib/utils/urgency.ts`, `lib/utils/scoring.ts`. These are intentional copies; **letting them drift silently breaks display consistency** with no test to catch it.
3. **Tests** — `api/src/domain/urgency.spec.ts`, `api/src/common/utils/scoring.spec.ts`, `lib/utils/urgency.test.ts`
4. **This document** — §4, §5, §8
5. **`docs/project-status.md`** — if user-visible behavior changes
6. **`CLAUDE.md`** — if the terminology section is affected
7. **A stored-value migration decision** — existing rows hold values from the old formula. Decide explicitly whether to backfill via a full recompute or accept mixed-vintage history, and record the choice.

**Requires a product/research decision before changing, not just a code review:**

- Any weight change (`PLAN.md` §15 Q4 is still open)
- Reconciling the band/level thresholds (§5)
- Adding citizen severity to `urgency_score` (§8)
- Changing the 30 mm/h precipitation cap or the 10-member cluster saturation
- Changing the deduplication radii (`PLAN.md` §15 Q5 is still open)
