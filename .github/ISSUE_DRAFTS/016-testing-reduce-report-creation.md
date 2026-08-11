# Reduce report creation in admin-tickets.spec.ts

**Labels:** `testing`, `priority:p2`, `dx`
**Type:** Test refactor
**Priority:** P2 — highest-impact quality-of-life fix for the whole team

## Background

`docs/testing.md` §6 and §9. A full Playwright run posts roughly **16 real reports**:

| Spec | Reports |
|---|---|
| `admin-tickets.spec.ts` | **7** |
| `citizen-dispute.spec.ts` | 6 |
| `admin-work-orders.spec.ts` | 2 |
| `citizen-reports.spec.ts` | 1 |

`RateLimitService` backstops report submission at **20 per hour per IP**, and every local request comes from `127.0.0.1`. One full run fits; a second within the same hour fails with 429 partway through.

## Problem

`admin-tickets.spec.ts` alone accounts for **7 of the 16** — nearly half the budget — via seven separate `createThrowawayReport()` calls. Several of those tests do not need a pristine ticket; they need *a* ticket.

Cutting this materially increases how often the team can run the full suite.

## Proposed scope

Audit the seven call sites and convert the ones that do not require a pristine ticket to a shared `beforeAll` fixture, following the pattern `admin-work-orders.spec.ts` already uses (`sharedMeoTicketId` / `sharedMdrrmoTicketId`).

Current call sites and a first-pass assessment — **verify each before changing it**:

| Test | Needs pristine? |
|---|---|
| queue → detail navigation | No — any ticket works |
| Ticket Detail read-only sections | No |
| dispute section visibility | **Yes** — advances status and disputes |
| status advancement | **Yes** — mutates status, no revert |
| office reassignment | **Yes** — mutates office |
| mobile card list | No |
| admin-UI resolution + Case Closure | **Yes** — resolves the ticket |

If that holds, three read-only tests can share one fixture: **7 → 5 reports**, a suite total of ~14.

## Implementation notes

- **Do not share a ticket between a mutating and a non-mutating test.** That is exactly the shared-state coupling the suite was recently cleaned of (`docs/testing.md` §5).
- Every shared fixture needs a comment explaining why sharing is safe *for those specific tests*, and that it depends on `--workers=1`.
- Keep the jitter on any ticket that is still created — a fixed coordinate merges into another run's ticket via the 25 m Pothole dedup radius.
- Update the report-count table in `docs/testing.md` §6 with the new numbers. **The numbers in the docs must stay accurate** — they are what the team plans runs around.

## Files likely involved

- `e2e/admin-tickets.spec.ts`
- `docs/testing.md` §6 (count table) and §9
- `docs/project-status.md` §4.3

## Acceptance criteria

- [ ] `admin-tickets.spec.ts` creates fewer reports than before, with the new count stated in the PR.
- [ ] Every test still passes when the file is run alone.
- [ ] No mutating test shares a ticket with another test.
- [ ] Each shared fixture carries a comment justifying it.
- [ ] `docs/testing.md` §6's count table updated to the real new totals.

## Suggested tests

- Run `e2e/admin-tickets.spec.ts` alone and confirm all tests pass.
- Run it **twice in a row** — with fewer reports this should now be comfortable.

## Out of scope

`citizen-dispute.spec.ts`'s 6 reports (resolution and dispute are one-way transitions, so most genuinely need their own ticket — a separate look if wanted), test-database isolation (#018), and any rate-limit change.

## Risks / notes

The failure mode to avoid is over-sharing: a status-advancement test running before a "should be in Reported state" test would fail confusingly. When in doubt, keep the fixture separate.

## Claude Code handoff prompt

```
Reduce report creation in PORAC-SDSS's e2e/admin-tickets.spec.ts.

Read first: e2e/admin-tickets.spec.ts (all seven createThrowawayReport call
sites), e2e/admin-work-orders.spec.ts (the sharedMeoTicketId beforeAll pattern
to copy), docs/testing.md §5 and §6.

Context: a full suite run posts ~16 reports against a 20/hour per-IP limit;
this file alone accounts for 7. Cutting it lets the team run the suite more
often.

Audit each of the seven call sites and convert only those that do NOT need a
pristine ticket to a shared beforeAll fixture. Tests that advance status,
reassign office, resolve, or dispute MUST keep their own disposable ticket —
those are one-way mutations and sharing would reintroduce exactly the shared-
state coupling this suite was recently cleaned of.

Likely shareable (verify before changing): queue -> detail navigation, Ticket
Detail read-only sections, mobile card list.

Every shared fixture needs a comment saying why sharing is safe for those
specific tests and that it depends on --workers=1. Keep coordinate jitter on
any ticket still created (25 m Pothole dedup radius).

Update docs/testing.md §6's report-count table with the REAL new numbers — the
team plans runs around them — and docs/project-status.md §4.3.

Verify: pnpm exec playwright test e2e/admin-tickets.spec.ts -- --workers=1
Run it twice in a row to confirm the lower budget holds. Then git diff --check
```
