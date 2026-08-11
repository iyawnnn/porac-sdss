# [Deferred] Citizen-facing work-order status rollup

**Labels:** `deferred`, `discussion`, `product`
**Type:** Product idea — **not scheduled**
**Priority:** None — deferred

> **Deferred, not queued.** `docs/project-status.md` §5 lists this; §6 "Do Not Build Yet" explicitly forbids building any citizen-facing work-order surface until §5 is picked up and scoped. Do not implement.

## Background

Work orders track the field work needed to resolve a ticket. They carry internal `notes`, an assigned office, an optional assigned admin, a due date, and their own status track.

**`notes` and every other work-order field are staff-only, by structural design** — not by presentation. No `api/src/citizens/*` response type includes any work-order field; the CSV export excludes `notes` at the query level rather than filtering after selection; and `e2e/admin-work-orders.spec.ts` plants a sentinel note and asserts it never appears on the citizen page.

## The idea

Show a citizen a **rollup** — e.g. "work in progress" — derived from the work orders on their ticket, without exposing any underlying work order or its notes.

## Why it is deferred

The idea is reasonable: today a citizen sees ticket status (`Reported → Under Review → In Progress → Resolved`) but nothing about whether field work is actually underway. A ticket can sit "In Progress" while a crew is dispatched, or while nothing is happening.

But the constraint is strict and deliberate. `docs/project-status.md` §6 and §7 both name citizen exposure of work orders or internal notes as a risk to avoid, and §5 says a rollup is "the only citizen-facing form ever worth considering, and only once explicitly scoped."

Real design questions that must be answered first:

- **What exactly does the rollup say?** "Work in progress" is fine; "3 of 4 tasks complete" starts leaking operational structure.
- **What does it say when there are no work orders?** A ticket can legitimately be resolved without any. Silence, or a neutral message?
- **Does it create an expectation the office cannot meet?** Telling a citizen work is scheduled implies a timeline the LGU may not want to commit to.
- **Does the derivation leak anything?** A rollup computed from statuses could still reveal that a work order was *cancelled*, which is internal.

## What would need to happen first

1. A stated need — ideally from MEO/MDRRMO, not inferred.
2. An explicit product decision on the exact wording and the empty case.
3. Promotion from `docs/project-status.md` §5 into §4 with a stated reason.
4. A design review confirming the rollup leaks nothing about work-order internals.

## Acceptance criteria

**Not applicable — this is not scheduled work.** There is nothing to accept.

The only "done" state for this issue is a deliberate decision: either it is promoted into `docs/project-status.md` §4 with a stated requirement (at which point a real issue with real acceptance criteria replaces this one), or it is closed as not planned.

## Out of scope

Everything until the above. **Under no circumstances** expose a work order, its notes, its assignee, or its due date to a citizen surface.

## Risks / notes

The failure mode is scope drift: a rollup that starts as "work in progress" and grows into a task list. The staff-only boundary is one of this system's clearest design rules and is regression-tested — keep it that way.

## Claude Code handoff prompt

```
DO NOT IMPLEMENT. This is deferred, and docs/project-status.md §6 explicitly
forbids any citizen-facing work-order surface until it is scoped.

If someone asks you to add a citizen-facing work-order rollup to PORAC-SDSS:

1. Check docs/project-status.md §5 (deferred) and §6 (Do Not Build Yet). Unless
   it has been formally promoted into §4, the answer is no.
2. If it HAS been promoted, these design questions must be answered before any
   code:
   - Exact wording of the rollup. "Work in progress" is acceptable;
     "3 of 4 tasks complete" leaks operational structure.
   - What it shows when a ticket has no work orders (which is legitimate).
   - Whether a cancelled work order can be inferred from the rollup — that is
     internal.
   - Whether it creates a service expectation the LGU has not agreed to.

ABSOLUTE CONSTRAINT, regardless: never expose a work order, its notes, its
assignee, or its due date to any citizen response type or citizen surface.
That boundary is structural (no citizen DTO includes work-order fields; the CSV
export excludes notes at the query level) and regression-tested
(e2e/admin-work-orders.spec.ts plants a sentinel note and asserts it never
reaches the citizen page). Do not weaken any of that.

Read for context: docs/features.md §3.4, docs/user-flows.md §6,
docs/security.md §7, api/src/reports/reports.service.ts (the curated citizen
DTOs).
```
