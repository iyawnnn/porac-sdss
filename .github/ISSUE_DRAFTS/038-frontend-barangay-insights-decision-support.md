# Add sortable, rankable triage view to Barangay Insights

**Labels:** `frontend`, `priority:p2`
**Type:** Enhancement (decision-support fix)
**Priority:** P2 — direct decision-support gap, zero backend work

## Background

`/admin/barangay-insights` (`components/features/admin/barangay-insights/BarangayInsightsWorkspace.tsx`) lists all 29 Porac barangays with total/active/resolved/high-urgency ticket counts, most common category, and last-activity date. The index query (`api/src/admin/barangay-insights.service.ts`, `listInsights()`) hardcodes `ORDER BY b.name ASC` — there is no sort control anywhere on the page, only a name-substring search filter.

## Problem

The entire purpose of this page — per `docs/features.md` §3.6, this is the spatial decision-support core of the app — is comparing 29 barangays to find where MEO/MDRRMO should focus attention. Today that requires an admin to eyeball an alphabetical list of 29 rows and mentally track which has the highest active/high-urgency count. There is no way to sort by the very numbers the page exists to show.

## Operational / user value

Turns "which barangay needs attention most" from a manual scan into a one-click sort — this is the clearest, most direct decision-support fix found in the audit that produced this issue.

## Scope

Add sortable columns (Total, Active, High-Urgency ticket counts, and Last Activity) to the existing index table/card list. Sort client-side over the already-fetched 29-row array — there is no pagination on this page today and none is needed (29 barangays is a fixed, small `MUNICIPALITY`-config-driven count). Do not change the server-side query's default ordering unless you also decide to change the *default* sort the page opens with (optional — state your choice and reasoning in the PR; either keeping alphabetical-by-default with sort controls, or defaulting to worst-first, is acceptable).

## File ownership

- `components/features/admin/barangay-insights/BarangayInsightsWorkspace.tsx` only.

## Files the other developer (Ian) should avoid while this is active

- `components/features/admin/barangay-insights/**`

## Reuse of existing data/API

`GET /admin/barangay-insights`'s existing per-row fields (`total_tickets`, `active_tickets`, `high_urgency_tickets`, `last_activity` or equivalent — verify exact field names in `barangay-insights.service.ts`) — no change needed to the response shape.

## Backend impact

None. This is a pure client-side sort over data already being fetched in full.

## Dependencies

None — safe to start immediately, in parallel with #035, #036, #037.

## Acceptance criteria

- [ ] Clicking a sortable column header sorts the list ascending, then descending on a second click.
- [ ] All 29 barangays still always render, including those with zero tickets for the scoped office (existing behavior — do not regress it).
- [ ] The existing name-substring search filter still works, and composes correctly with the new sort (e.g. searching narrows the set, sort still applies to what remains).
- [ ] Office scoping is unchanged — an MEO/MDRRMO admin still only ever sees their own office's counts per barangay.
- [ ] The PR states which column the page defaults to sorting by and why.

## Validation

- `pnpm build`, `pnpm lint`.
- Manual check as MEO admin, MDRRMO admin, and system administrator.
- `e2e/admin-barangay-insights.spec.ts` if it exists and is affected (check for any test asserting a specific row order).

## Out of scope

Any change to the Barangay Profile page (`BarangayProfile.tsx`, `BarangayTrendChart.tsx`, `CategoryBreakdownList.tsx`) — this issue is scoped to the index page only. CSV export, barangay create/edit/delete, and elevation *filtering* remain explicitly deferred per `docs/project-status.md` §5 — do not add any of them here.

## Claude Code handoff prompt

```
Add sortable columns to PORAC-SDSS's Barangay Insights index page. This is
issue #038 — an independent frontend task, safe to work in parallel with
#035, #036, and #037.

Read first: components/features/admin/barangay-insights/BarangayInsightsWorkspace.tsx
(the only file to change), api/src/admin/barangay-insights.service.ts's
listInsights() method (to confirm the exact field names already returned per
row — total/active/high-urgency counts, last activity), docs/features.md §3.6
(what this page is for).

The page currently hardcodes ORDER BY b.name ASC server-side with no sort
control. Add client-side sortable columns (Total, Active, High-Urgency counts,
Last Activity) over the already-fetched 29-row array — there are only ever 29
barangays and no pagination exists or is needed here.

Do NOT change the GET /admin/barangay-insights response shape or add a new
endpoint — every field you need is already returned. Do NOT touch the
Barangay Profile page (BarangayProfile.tsx and its children) — this is scoped
to the index only. Do NOT add CSV export, barangay editing, or elevation
filtering — all three are explicitly deferred product decisions per
docs/project-status.md §5, not part of this issue.

Preserve the existing name-substring search filter and make sure it composes
correctly with sorting. Preserve office scoping exactly — an MEO/MDRRMO admin
must keep seeing only their own office's counts per barangay, and all 29
barangays must still always render even when a scoped office has zero tickets
in one.

State in your summary which column the page defaults to sorting by.

Verify: pnpm build, pnpm lint, manual check as MEO, MDRRMO, and system admin
sessions. If e2e/admin-barangay-insights.spec.ts exists, run it:
pnpm exec playwright test e2e/admin-barangay-insights.spec.ts -- --workers=1
Then git diff --check.
```
