# PORAC-SDSS — Spaghetti / Readability Audit

Scope scanned: `app/`, `components/`, `lib/`, `api/src/`, `e2e/`, `scripts/`, `.github/workflows/`
(no `src/` exists — the frontend lives in `app/` + `components/` + `lib/` per CLAUDE.md).

**334 files scanned** (25 of them `components/ui/*` shadcn-generated, excluded from findings).
**14 findings.** No files edited.

## Headline

The backend is not the problem. `api/src/` is consistently readable — numbered
step comments, real "why" rationale, linear control flow. The spaghetti is
concentrated in **six frontend files plus one e2e spec**, all sharing the same
signature: entire components collapsed onto single 600–2,500 character lines.
That is not a style preference, it's minified-source-shaped code that git
blame, code review, and stack traces cannot address.

Second theme: five admin workspace components each carry a **byte-identical
copy** of the same pagination/query-state helpers.

---

## Findings

### F1 — `components/features/admin/dashboard/DashboardClient.tsx`
**Lines:** 54, 56–67, 108, 111–113, 117–122 (`RankedTableCard`, `IncidentTooltip`, `DashboardClient` body)
**Problem:** Minified one-liners. Line 108 is **2,571 characters** — an entire table component with two `.map` branches, a type cast, a percentage calculation and ~20 JSX elements on one physical line. Line 117 is 2,091 chars. Lines 111–112 pack 6 and 6 statements respectively onto one line each.
**Why it's hard to maintain:** A one-character change to `RankedTableCard` produces a 2,571-char diff line — review is impossible, and `git blame` collapses the whole component to one commit. The `isBarangay` branch inside `.map()` with a `raw as BarangayRiskRow` cast is genuinely hard to follow when it can't be read vertically.
**Cleanup:** Reformat to multi-line (this file only, not repo-wide). Then split `RankedTableCard` into `BarangayRow` / `CategoryRow` so the `kind` discriminator + `as` casts disappear.
**Risk:** Low (reformat) → Medium (the row split changes structure; the `share` math on line 108 should get a small unit test first).
**Verdict:** **Fix now.** Worst file in the repo.

### F2 — `components/features/admin/map/MapClient.tsx`
**Lines:** 128, 129, 158, 166–172
**Problem:** Line 171 is **1,664 chars** — the entire `MapContainer` tree including tile layer, boundary layers, heatmap/cluster branch, marker `.map()` with inline `eventHandlers`, `ref` callback and conditional `Popup`. Line 128 is a full `useEffect` with `AbortController`, fetch, try/catch/finally on one line. Line 129 chains two independent fetches with `.then/.catch` on one line.
**Why it's hard to maintain:** The marker branch at line 171 contains the heatmap-vs-cluster decision, per-marker selection state, and urgency registration — the most behavior-dense code on the admin map, and none of it is readable in a diff. Line 128's abort handling is correct but unverifiable at a glance.
**Cleanup:** Reformat lines 166–172 and extract the `MarkerClusterGroup` block into a `TicketMarkers` component. Split line 128 into a named `loadTickets` and line 129 into two effects or two named loaders.
**Risk:** Low for the reformat; Medium for the `TicketMarkers` extraction (react-leaflet ref/lifecycle behavior — verify `registerMarkerUrgency` still fires).
**Verdict:** **Fix now** (reformat), defer the extraction to a second pass.

### F3 — `components/features/admin/map/MapFilterBar.tsx`
**Lines:** 24–27 (each 550–1,416 chars), 34 (1,050+ chars)
**Problem:** Four near-identical `<Select>` filter blocks, each one line, each 550–1,400 chars. Line 34 is the whole desktop card *and* the whole mobile sheet on one line.
**Why it's hard to maintain:** Lines 24–27 are the same shape four times (trigger + "all" sentinel + option map) with the trigger's `className` string repeated verbatim. Adding a fifth filter means copying a 1,000-char line. The `value === "all" ? "" : value` sentinel convention is repeated four times with no comment explaining why empty-string means "no filter."
**Cleanup:** Reformat, then extract a local `FilterSelect({ label, value, options, onChange, renderOption })`. Collapses four blocks to four calls and kills the duplicated `className`.
**Risk:** Low. Pure presentational, no RBAC/scoping logic.
**Verdict:** **Fix now.** Highest ratio of readability gained to risk taken.

### F4 — `components/features/admin/dashboard/DashboardStates.tsx`
**Lines:** 5–10 (`TableSkeleton`, `DonutSkeleton`, `DepartmentSkeleton`, `OfficePerformanceSkeleton`, `DashboardSkeleton`)
**Problem:** Every skeleton is a single line; `DashboardSkeleton` (line 10) is **1,536 chars**. Notably, `DashboardError` right below it (lines 11–19) is formatted normally — the inconsistency within one file is itself the tell.
**Why it's hard to maintain:** The skeleton grid must mirror `DashboardClient`'s real grid (`dashboard:col-span-3`, `dashboard:col-span-1`, etc.). Verifying that mirror across two files is already fiddly; doing it against a 1,536-char line makes layout drift invisible.
**Cleanup:** Reformat only. No structural change needed — the component decomposition is already correct.
**Risk:** Low. Skeletons render no data.
**Verdict:** **Fix now.** Zero-risk quick win.

### F5 — `components/features/admin/dashboard/SeverityRadialChart.tsx` & `DistributionDonutChart.tsx`
**Lines:** `SeverityRadialChart.tsx:8` (477 chars), `:14` (1,489 chars); `DistributionDonutChart.tsx:18`, `:32` (869 chars)
**Problem:** Same minified pattern. `DistributionDonutChart.tsx:18` puts an 8-field destructured prop type inline in the signature; `:32` holds the full `PieChart` with an inline `formatter` render-prop returning JSX.
**Why it's hard to maintain:** The inline `formatter` on `:32` is a nested component inside a prop inside a one-liner — three levels of "render logic inside render," which is exactly what makes chart tooltips hard to change.
**Cleanup:** Reformat; lift the prop types to named `type` declarations; extract the tooltip `formatter` to a named `DonutTooltipRow` component.
**Risk:** Low.
**Verdict:** **Fix now** (same batch as F1/F4 — same folder, same reviewer context).

### F6 — `e2e/admin-dashboard.spec.ts`
**Lines:** 16, 18, 20–30 (every test body is one line; six lines exceed 680 chars, line 26 is 1,406)
**Problem:** Each `test(...)` is a single line containing 8–15 sequential `await`s, `Promise.all` destructuring, `evaluate` callbacks and multiple assertions.
**Why it's hard to maintain:** **This is the highest-cost finding despite being test code.** When a Playwright assertion fails, the reporter points at a line number — and every assertion in the test shares one line number. Debugging a flake here means bisecting a 1,400-char line by hand. Line 30 additionally wraps a 5-case `for` loop around a `test()` declaration on the same line.
**Cleanup:** Reformat only — one `await` per line. Do not restructure the tests, do not touch `loginAdmin`/credentials (`e2e/test-credentials.ts` centralization must stay).
**Risk:** Low. Pure formatting; assertions unchanged.
**Verdict:** **Fix now.** Highest debugging-time payback in the repo.

### F7 — Duplicated workspace helpers across five admin components
**Files:** `flagged/FlaggedWorkspace.tsx:48,73,88,102,106`, `tickets/TicketsWorkspace.tsx:47,75,89,103,107`, `activity-log/ActivityLogWorkspace.tsx:48,60,71`, `work-orders/WorkOrdersWorkspace.tsx:38,51,65`, `notifications/NotificationCenterWorkspace.tsx:26,34`
**Problem:** `getPageNumbers(current, total)` is **byte-for-byte identical** in at least three files (verified by diff). `buildParams`, `initialQueryState`, `formatDate`, `HEAD_CLASS`, and the `skipFetchRef`/`skipSearchDebounceRef` skip-first-effect pattern are each duplicated 3–5 times with only small deliberate variations.
**Why it's hard to maintain:** A pagination bug must be fixed in five places, and nothing makes the fifth copy discoverable. `HEAD_CLASS` being redefined per file means table headers can silently drift apart.
**Cleanup:** Move `getPageNumbers` and `HEAD_CLASS` to a shared module (`lib/utils/ui/` already exists — `lib/utils/ui/urgency.ts` is imported by `MapFilterBar`). Leave `initialQueryState`/`buildParams` alone — they differ meaningfully per workspace and their office-defaulting touches scoping.
**Risk:** Low for `getPageNumbers` (pure, identical, easy unit test) / **High if you also merge `initialQueryState`** — those functions default `office` from the session (`FlaggedWorkspace.tsx:48`, `TicketsWorkspace.tsx:47`, `WorkOrdersWorkspace.tsx:38`) and unifying them risks weakening office scoping. Don't.
**Verdict:** Extract `getPageNumbers` + `HEAD_CLASS` now. **Explicitly defer / do-not-do:** merging `initialQueryState`.

### F8 — `api/src/reports/reports.service.ts` — `submit()`, lines 154–455
**Problem:** 303-line method. Two `INSERT INTO reports (...)` statements (lines 293–306 and 396–409) with an identical 15-column list and identical value expressions, differing only in `ticket_id`.
**Why it's hard to maintain:** Adding a report column means editing two SQL literals that must stay in lockstep; missing one silently drops data on either the merge path or the new-ticket path. That is a real latent bug class, not a style issue.
**Cleanup:** Extract one `insertReport(tx, ticketId, ...)` helper used by both branches. Leave the rest of `submit()` alone — the numbered Step 1–8 comments make the length navigable, and the transaction boundary comments (advisory-lock rationale, post-commit recompute) are genuinely good "why" comments.
**Risk:** **Medium** — inside a transaction that owns dedup. `api/src/reports/reports.service.spec.ts` already covers merge vs. new-ticket; run it.
**Verdict:** **Fix now.** Small diff, removes a real duplication hazard.

### F9 — `api/src/auth/oauth/oauth.controller.ts` — `handleCallback`, lines 138–298
**Problem:** 160-line method handling three distinct purposes (`login` / `link` / `reauth`) plus ~12 `debugLog` calls interleaved with control flow.
**Why it's hard to maintain:** The three purposes are sequential rather than dispatched, so the `reauth` path is only reachable by falling past two earlier returns. The debug logging roughly doubles the line count of the security-relevant logic.
**Cleanup:** Split the post-state-consume body into `handleLogin` / `handleLink` / `handleReauth`, keeping the shared session re-verification (lines 224–234) in the parent.
**Risk:** **High** — this is an auth boundary. The session re-verification at 224–234 is defense-in-depth and must keep gating both `link` and `reauth`. The catch block at 281 depends on `consumed.purpose` for its redirect target.
**Verdict:** **Defer.** It is long but linear, correct, and well-commented. Not worth the risk without a specific reason to touch it. `oauth.controller.spec.ts` exists but this is still auth.

### F10 — `api/src/domain/recompute.service.ts:22` (134 lines), `api/src/admin/moderation.service.ts:249` `moderateReport` (119), `api/src/admin/tickets.service.ts:493` `advanceStatus` (117)
**Problem:** Long methods doing several things.
**Why it's hard to maintain:** Moderate concern only. All three are linear and commented.
**Cleanup:** None proposed. `advanceStatus` and `moderateReport` write audit events and enforce office scoping; splitting them adds an authorization path to keep in sync — the exact anti-pattern CLAUDE.md warns about for exports.
**Risk:** High if touched, none if left.
**Verdict:** **Defer indefinitely.** Long ≠ spaghetti.

### F11 — `components/features/admin/flagged/FlaggedWorkspace.tsx` — main component, lines 142–482
**Problem:** 340-line component body inside a 790-line file.
**Why it's hard to maintain:** The file is otherwise well-decomposed (`ReportRow`, `ReportCard`, `SkeletonRows`, `ReportDetail`, `ActionButton` are all separate). Only the main body is oversized: filter bar + table + card list + pagination + review sheet in one function.
**Cleanup:** Extract the filter bar and the pagination footer (lines ~400–440) into local components. Both are already duplicated in spirit with `TicketsWorkspace` (see F7).
**Risk:** Low-Medium. `data-testid`s are used by `e2e/admin-flagged.spec.ts` — preserve them exactly.
**Verdict:** **Defer to batch 2.** Real, but not urgent; the file is readable line-by-line.

### F12 — `components/features/admin/tickets/TicketsWorkspace.tsx` — lines 109–443
**Problem:** Same shape as F11 — 334-line main component, well-factored surroundings.
**Verdict:** **Defer to batch 2.** Same treatment as F11, same session.

### F13 — Nested ternaries: `app/(citizen)/dashboard/reports/[id]/page.tsx:92`, `components/features/admin/tickets/HorizontalStatusTracker.tsx:107`
**Problem:** `tone === "amber" ? … : tone === "violet" ? … : …` and a 4-branch `StepState` ternary chain.
**Why it's hard to maintain:** `HorizontalStatusTracker.tsx:107` encodes real state-machine logic (`rejected` / `done` / `active` / `upcoming`) as a chained ternary; the rejected-node case short-circuits everything before it, which is easy to misread as a precedence bug.
**Cleanup:** `page.tsx:92` → a `Record<Tone, string>` lookup. `:107` → a small `stepState(i, currentIndex, isRejectedNode)` function with early returns.
**Risk:** Low. Both are pure display.
**Verdict:** Fix `page.tsx:92` in batch 1 (trivial). `HorizontalStatusTracker` in batch 2.

### F14 — `app/(citizen)/reports/page.tsx:93,147,183,194,200,229`
**Problem:** Six long lines — but all of them are single Tailwind `className` strings.
**Verdict:** **Leave alone.** Long Tailwind class strings are not spaghetti; splitting them is exactly the style-only churn to avoid.

---

## Ranked cleanup plan

### Top 5 quick wins (Low risk, formatting/extraction only)
1. **`e2e/admin-dashboard.spec.ts`** — reformat all 8 one-line tests. Biggest debugging payback, zero behavior risk. (F6)
2. **`components/features/admin/dashboard/DashboardStates.tsx`** — reformat 5 skeleton functions. Renders no data. (F4)
3. **`components/features/admin/map/MapFilterBar.tsx`** — reformat lines 24–27, 34; then extract `FilterSelect`. Kills 4× duplicated trigger classNames. (F3)
4. **`getPageNumbers` + `HEAD_CLASS` → `lib/utils/ui/`** — three byte-identical copies proven by diff. Add one unit test for `getPageNumbers`. (F7, partial)
5. **`app/(citizen)/dashboard/reports/[id]/page.tsx:92`** — nested ternary → `Record` lookup. One-line change. (F13)

### Top 5 risky / high-value refactors (Medium+, need tests)
1. **`DashboardClient.tsx`** — reformat, then split `RankedTableCard` into two row components. Removes the `kind` discriminator and both `as` casts. Highest total value in the repo. (F1)
2. **`reports.service.ts` — extract shared `insertReport`** — removes a genuine two-copies-must-match hazard inside the dedup transaction. Medium risk, run `reports.service.spec.ts`. (F8)
3. **`MapClient.tsx` — extract `TicketMarkers`** — verify `registerMarkerUrgency` and popup/marker selection still behave; react-leaflet refs are lifecycle-sensitive. (F2)
4. **`FlaggedWorkspace.tsx` + `TicketsWorkspace.tsx` — extract filter bar + pagination footer** — do both together so the shared shape is obvious. Preserve every `data-testid`. (F11, F12)
5. **`HorizontalStatusTracker.tsx:107` — ternary chain → `stepState()`** — real state-machine logic; worth a small unit test asserting all four states. (F13)

### Files to leave alone
- **`components/ui/**` (25 files)** — shadcn-generated. `sidebar.tsx` (702 lines, 13 long lines) and `chart.tsx` are upstream code; local reformatting only creates upgrade conflicts.
- **`lib/utils/urgency.ts` / `lib/utils/scoring.ts` vs. their `api/src/` twins** — duplication is deliberate and documented in CLAUDE.md and `docs/triage-model.md`, with a change-control rule. Not a DRY violation to fix.
- **`lib/gis/categoryMarker.tsx` / `lib/gis/clusterIcon.ts`** — the `count < 10 ? 32 : count < 50 ? 42 : 54` chains are readable size buckets, and the `WeakMap` carries a real "why" comment. Clean as-is.
- **`api/src/domain/recompute.service.ts`, `admin/moderation.service.ts`, `admin/tickets.service.ts`** — long but linear; carry audit-event and office-scoping logic. (F10)
- **`api/src/auth/oauth/oauth.controller.ts`** — auth boundary, well-commented. (F9)
- **`app/(citizen)/reports/page.tsx`** and every other file whose only "long lines" are Tailwind class strings. (F14)
- **`.github/workflows/*.yml`** (48 + 61 lines) — clean.
- **`scripts/`** (3 files) — clean.
- **`api/scripts/` migrations** — out of scope per the brief; nothing unusual spotted.

## Constraint check
No proposed change touches RBAC, office scoping, audit trails, rate limits, or
work-order `notes`. F7 explicitly *rejects* merging `initialQueryState` for
exactly that reason. No new features, no nav entries, no test bypasses.