# [Deferred] Export audit logging

**Labels:** `deferred`, `discussion`, `security`
**Type:** Product idea — **evaluated and deliberately skipped**
**Priority:** None — deferred

> **Deferred, not queued.** Listed in `docs/project-status.md` §5. This was already evaluated once during the Reporting and Export Tools work and skipped for a stated reason. Do not implement without a real compliance requirement.

## Background

`/admin/reports` and the per-page export buttons let an admin download ticket and work-order CSVs. Office scoping is enforced — `ReportsService` reuses the list endpoints' own filter parsers, so an export can never return more than the equivalent list view.

`admin_audit_events` records every admin **mutation** transactionally: account changes, ticket status and reassignment, moderation, the full work-order lifecycle. It does not record reads.

## The idea

Log who exported what, and when.

## Why it was skipped

Recorded in `docs/project-status.md` §3 (Reporting and Export Tools) and `docs/security.md` §6.3:

> `AdminAuditService`'s schema requires a specific `targetId`/`targetType` for every event (`admin | ticket | report | work_order`) — a read-only, filter-driven export has no single target to attach an event to, and inventing a synthetic one (e.g. `targetId: 0`) would be a schema-shape hack for a feature that isn't a mutation.

The alternatives all have real costs:

- **Synthetic target id** — pollutes the audit table's meaning and breaks the Activity Log's target-based filtering.
- **A new nullable-target event type** — loosens a schema constraint that currently guarantees every audit row points at something real.
- **A separate export-log table** — a new table, migration, retention policy, and `docs/database.md` entry, for a read-only action.

None is unreasonable; none is justified without a requirement.

## What would need to happen first

A **real compliance or oversight need**, such as:

- an LGU data-handling policy requiring access logs for citizen data,
- an actual incident or concern about export misuse,
- an external audit requirement.

Then a design decision on which of the three approaches to take, and promotion from §5 into §4.

## Acceptance criteria

**Not applicable — this is not scheduled work.** There is nothing to accept.

The only "done" state for this issue is a deliberate decision: either it is promoted into `docs/project-status.md` §4 with a stated requirement (at which point a real issue with real acceptance criteria replaces this one), or it is closed as not planned.

## Out of scope

Everything until such a requirement exists.

## Risks / notes

Worth noting for a capstone panel: exports **are** already access-controlled, and cannot return data the admin could not see in the UI. The gap is *traceability*, not *authorization* — a useful distinction if the question comes up.

## Claude Code handoff prompt

```
DO NOT IMPLEMENT. This was evaluated during the Reporting and Export Tools work
and deliberately skipped. It is deferred in docs/project-status.md §5.

If someone asks you to add export audit logging to PORAC-SDSS:

1. Confirm there is a REAL compliance or oversight requirement — an LGU policy,
   an incident, or an external audit. "It seems like good practice" is not
   sufficient; this was already considered and set aside.
2. If there is one, choose deliberately between three approaches and state the
   tradeoff:
   - synthetic targetId (pollutes audit semantics, breaks Activity Log
     target filtering) — probably wrong
   - a new nullable-target event type (loosens a constraint that currently
     guarantees every audit row points at something real)
   - a separate export-log table (new table + migration + retention policy +
     docs/database.md entry)
3. Promote it from docs/project-status.md §5 to §4 with the stated reason
   BEFORE writing code.

Read for context: api/src/admin/reports.service.ts,
api/src/admin/admin-audit.service.ts, docs/security.md §6.3,
docs/project-status.md §3 (Reporting and Export Tools) and §5.

Note the distinction if it comes up: exports are already access-controlled and
cannot return data the admin could not see in the UI. The gap is traceability,
not authorization.
```
