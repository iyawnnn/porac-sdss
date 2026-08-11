# Add citizen cross-account report access regression test

**Labels:** `security`, `testing`, `priority:p2`
**Type:** Test coverage
**Priority:** P2 — cheapest security test in the backlog

## Background

`docs/security-hardening-plan.md` R8. `ReportsService` checks ownership and existence in a **single clause**:

```sql
WHERE r.id = ${reportId} AND r.citizen_id = ${citizenId}
```

That shape matters: a nonexistent id and another citizen's id are indistinguishable to the caller, so the endpoint cannot be used to probe the id space for which reports exist.

## Problem

**The control is correct in code but has no test.** Nothing in `e2e/` asserts that citizen A cannot read citizen B's report. A refactor that splits the check into "fetch by id, then compare owner" would still function correctly for legitimate users while introducing an existence oracle — and the suite would stay green.

This is the one un-covered control in an otherwise well-tested authorization surface.

## Proposed scope

One focused API-level test:

1. Citizen A submits a report (or reuse a seeded one belonging to `citizen1`).
2. Citizen B signs up.
3. Citizen B requests `GET /api/reports/mine/{A's report id}` → must not return A's data.
4. Citizen B requests a **nonexistent** report id → the response must be **indistinguishable** from step 3 (same status, same body shape).

Step 4 is the important one — it is what proves there is no existence oracle.

Optionally extend to the two mutation endpoints, which use the same clause:
- `POST /reports/mine/:id/dispute`
- `POST /reports/mine/:id/confirm-resolution`

## Implementation notes

- Add to `e2e/citizen-reports.spec.ts`, which already has citizen signup helpers.
- **Reuse a seeded `citizen1` report** for A rather than submitting a new one, to keep the report budget at zero (`docs/testing.md` §6). The spec already has `fetchMyReports` and a `test.skip()` pattern for when seed data is absent — follow it.
- Citizen B does need a signup, but signups are not rate-limited the way reports are.
- Assert on **both** the status and the body — "same status, different body" would still leak.

## Files likely involved

- `e2e/citizen-reports.spec.ts`
- `docs/security-hardening-plan.md` R8, `docs/testing.md` §9, `docs/project-status.md` §4.3

## Acceptance criteria

- [ ] Citizen B cannot read citizen A's report.
- [ ] The response for another citizen's id is indistinguishable from a nonexistent id (status **and** body).
- [ ] Test skips cleanly, with a message naming `seed:diverse-reports`, when no seeded report exists.
- [ ] Adds zero new reports to the suite budget.
- [ ] `docs/security-hardening-plan.md` R8 marked done.

## Suggested tests

This issue *is* the test. Run only `e2e/citizen-reports.spec.ts`.

## Out of scope

Changing `ReportsService` (the check is correct), admin-side access tests (covered elsewhere), and citizen notification scoping.

## Risks / notes

The subtle failure mode to guard against is asserting only "B did not get A's data" while missing the oracle. Both halves of the assertion matter.

## Claude Code handoff prompt

```
Add a citizen cross-account report access regression test to PORAC-SDSS.

Read first: api/src/reports/reports.service.ts (note the single-clause
WHERE r.id = ... AND r.citizen_id = ... — that shape is the control being
tested), e2e/citizen-reports.spec.ts, docs/security-hardening-plan.md R8,
docs/testing.md §6.

Add one test to e2e/citizen-reports.spec.ts:
1. Take an existing seeded report belonging to citizen1 (use the existing
   fetchMyReports helper and the test.skip() pattern when seed data is absent).
   Do NOT submit a new report — keep the report budget at zero.
2. Sign up a fresh citizen B.
3. Citizen B requests that report by id -> must not receive citizen A's data.
4. Citizen B requests a NONEXISTENT report id -> the response must be
   indistinguishable from step 3, in BOTH status and body. This is what proves
   there is no existence oracle.

Optionally extend to POST /reports/mine/:id/dispute and
/confirm-resolution, which use the same clause.

Do not change ReportsService — the check is correct; this test protects it
from a refactor that splits ownership and existence into two steps.

Update docs/security-hardening-plan.md (R8 done), docs/testing.md §9,
docs/project-status.md §4.3.

Verify: pnpm exec playwright test e2e/citizen-reports.spec.ts -- --workers=1
Then git diff --check
```
