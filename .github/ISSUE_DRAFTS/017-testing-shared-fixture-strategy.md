# Document and standardize the Playwright shared-fixture strategy

**Labels:** `testing`, `priority:p2`, `docs`
**Type:** Chore (test infrastructure)
**Priority:** P2 — do **after** #016, which produces the evidence

## Background

`docs/testing.md` §5. The suite currently uses three different approaches to obtaining a ticket:

1. **A fresh disposable ticket per test** — `createThrowawayReport` in `admin-tickets.spec.ts`.
2. **One shared disposable ticket per file** — `sharedMeoTicketId` / `sharedMdrrmoTicketId` in `admin-work-orders.spec.ts`.
3. **Module-level state shared between two tests** — `resolvedFixture` in `admin-tickets.spec.ts`.

Each is correct where used, and each carries a comment explaining itself. But the choice is currently made case by case, from precedent, and `createDisposableTicket` / `createThrowawayReport` are near-duplicate helpers living in two files.

## Problem

A developer adding a spec has no stated rule for which approach to use. The likely outcomes are a fresh report per test (burning the rate-limit budget) or over-sharing (reintroducing the flakiness the suite was recently cleaned of).

## Proposed scope

**Documentation and light consolidation — not a rewrite.**

1. **Write the decision rule** into `docs/testing.md` §5, as a short table:

   | Your test... | Use |
   |---|---|
   | mutates ticket status, office, or resolution | its own disposable ticket |
   | only reads, or attaches uniquely-named child records | a file-level shared fixture |
   | needs to observe another test's outcome | explicit module state, commented |
   | needs no ticket at all | none — do not create one |

2. **Consider extracting the duplicated helper** into `e2e/helpers.ts` — one `createDisposableTicket(browser, label)` that both files use. Only do this if it does not obscure the per-file comments explaining *why* sharing is safe there.

3. **Add the report-budget reminder** to the "adding a new spec" checklist in `docs/testing.md` §10: count how many reports your spec adds, and keep it minimal.

## Implementation notes

- **Do #016 first.** That pass will reveal which tests genuinely need pristine tickets, and the rule should be written from that evidence rather than guessed at.
- If the helper is extracted, keep the jitter and the `Pothole`-routes-to-MEO comment with it — those are non-obvious and load-bearing.
- Resist inventing a fixture framework. Playwright's `beforeAll` plus a documented rule is sufficient at this scale.

## Files likely involved

- `docs/testing.md` §5 and §10
- Possibly `e2e/helpers.ts` (extracted helper)
- Possibly `e2e/admin-tickets.spec.ts`, `e2e/admin-work-orders.spec.ts` (import the shared helper)

## Acceptance criteria

- [ ] `docs/testing.md` §5 contains an explicit decision rule a new contributor can follow without reading every spec.
- [ ] §10's checklist mentions counting the reports a new spec adds.
- [ ] If the helper is extracted: both call sites use it, jitter and routing comments preserved, all affected specs still pass.
- [ ] No behavior change to any existing test.

## Suggested tests

- Run the specs touched by any helper extraction: `e2e/admin-tickets.spec.ts` and `e2e/admin-work-orders.spec.ts`.
- If the change is documentation-only, no test run is needed beyond a link check.

## Out of scope

Per-run database isolation (#018) — that would eventually make much of this moot, but it is a much larger change. Also: any custom Playwright fixture framework, and changing `--workers=1`.

## Risks / notes

The risk here is scope creep into a "test infrastructure improvement" project. This should be mostly a documentation change plus possibly one helper move.

## Claude Code handoff prompt

```
Document and lightly standardize the PORAC-SDSS Playwright fixture strategy.

Prerequisite: do issue #016 first — it produces the evidence for the rule.

Read first: docs/testing.md §5 and §10, e2e/helpers.ts,
e2e/admin-tickets.spec.ts (createThrowawayReport, resolvedFixture),
e2e/admin-work-orders.spec.ts (createDisposableTicket, sharedMeoTicketId).

This is mostly a DOCUMENTATION change. Do not build a fixture framework.

1. Add an explicit decision rule to docs/testing.md §5 as a short table:
   - test mutates ticket status/office/resolution -> its own disposable ticket
   - test only reads, or attaches uniquely-named child records -> file-level
     shared fixture created in beforeAll
   - test must observe another test's outcome -> explicit module state, with a
     comment noting it depends on --workers=1
   - test needs no ticket -> create none
2. Add a report-budget reminder to the §10 "adding a new spec" checklist.
3. OPTIONAL: extract the near-duplicate createDisposableTicket /
   createThrowawayReport into e2e/helpers.ts as one helper. Only do this if the
   per-file comments explaining why sharing is safe there are preserved. Keep
   the coordinate-jitter and "Pothole always routes to MEO" comments with it —
   both are load-bearing and non-obvious.

Do NOT change --workers=1, alter any test's behavior, or start on test-database
isolation (separate, much larger issue).

Verify: if you touched specs, run e2e/admin-tickets.spec.ts and
e2e/admin-work-orders.spec.ts with --workers=1. Then git diff --check
```
