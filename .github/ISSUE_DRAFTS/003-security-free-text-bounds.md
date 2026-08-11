# Add max length bounds for free-text fields

**Labels:** `security`, `priority:p2`, `backend`
**Type:** Enhancement (input validation)
**Priority:** P2

## Background

`docs/security-hardening-plan.md` R3 (Medium). Citizen report submission is properly bounded by Zod in `api/src/contracts/schemas.ts` — `title` 1–200, `description` ≤ 2000. The admin-side and dispute free-text fields are not.

## Problem

These fields have type and non-empty checks plus `.trim()`, but **no maximum length**:

| Field | Validated today by |
|---|---|
| `work_orders.title` | `WorkOrdersService.create`/`update` — non-empty only |
| `work_orders.notes` | same — trim only |
| `tickets.resolution_notes` | `TicketsService` status advance — trim only |
| `tickets.dispute_reason` | `ReportsService.disputeReport` — non-empty only |
| moderation `note` | `moderation.controller.ts` — passed through |

An authenticated user can write an arbitrarily large string into a Postgres text column. This is not injection (all queries are parameterized) and not XSS (React escapes), but it bloats the database, breaks table layouts, and inflates CSV exports.

## Proposed scope

Add `.max()` bounds matching the style `reportSchema` already uses. Suggested limits — choose deliberately, declare as named constants:

- `work_orders.title` — 200
- `work_orders.notes` — 2000
- `tickets.resolution_notes` — 2000
- `tickets.dispute_reason` — 1000
- moderation `note` — 1000

Over-length input returns **400**. Never silently truncate — truncating a citizen's dispute reason or a staff resolution note loses real information.

## Implementation notes

- No schema change needed. These are `text` columns; the bound is an application guard.
- Keep validation where it already lives (service layer for work orders/tickets, controller for moderation). Do not introduce a new validation framework.
- The citizen-facing dispute limit should produce a message the UI can display.

## Files likely involved

- `api/src/admin/work-orders.service.ts`
- `api/src/admin/tickets.service.ts`
- `api/src/reports/reports.service.ts`
- `api/src/admin/moderation.controller.ts`
- Possibly `api/src/contracts/schemas.ts` if constants are centralized
- `docs/security-hardening-plan.md` R3, `docs/project-status.md` §4.1

## Acceptance criteria

- [ ] Each of the five fields rejects over-length input with 400.
- [ ] No silent truncation anywhere.
- [ ] Limits are named constants, not inline magic numbers.
- [ ] Normal-length input is unaffected.
- [ ] Docs updated.

## Suggested tests

- Unit tests: one over-length case per field → 400.
- `pnpm --prefix api test`
- Optionally one E2E asserting the dispute form surfaces the error, if the UI needs a message.

## Out of scope

Schema-level `varchar(n)` constraints (an application guard suffices and avoids a migration), rich-text handling, and any change to what the fields mean.

## Risks / notes

Choose limits generous enough for real use — a resolution note describing complex field work can legitimately run long. 2000 characters is roughly a page.

## Claude Code handoff prompt

```
Add maximum-length validation to PORAC-SDSS free-text fields.

Read first: api/src/contracts/schemas.ts (for the existing .max() style),
api/src/admin/work-orders.service.ts, api/src/admin/tickets.service.ts,
api/src/reports/reports.service.ts, api/src/admin/moderation.controller.ts,
docs/security-hardening-plan.md R3.

Add max-length bounds: work_orders.title (200), work_orders.notes (2000),
tickets.resolution_notes (2000), tickets.dispute_reason (1000), moderation
note (1000). Named constants with a brief comment, matching reportSchema's style.

Over-length input must return 400 — never silently truncate.

Do NOT add a database migration (an application-level guard is sufficient), do
not introduce a new validation library, and do not move validation to a
different layer than where it currently lives.

Add unit tests: one over-length case per field.

Update docs/security-hardening-plan.md (R3 done) and docs/project-status.md §4.1.

Verify: pnpm --prefix api test, git diff --check
```
