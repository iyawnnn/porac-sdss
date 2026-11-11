# Known limitations and parked review items

Evidence review: 2026-11-11, code baseline b2318c1. This is a behavior/uncertainty
register, not a second roadmap, a claim of production incidents, or authorization
to implement fixes. [Project status](project-status.md) owns the current queue.
This documentation pass made no product changes, concurrency experiments, live
provider calls, real database queries or production cleanup. A source-level risk is
not the same as a reproduced runtime defect.

## Input, concurrency and recovery

| Item | Current evidence and practical limit | Before proposing a fix |
| --- | --- | --- |
| Huge numeric ticket search | [TicketsService](../api/src/admin/tickets.service.ts) derives searchId from any digit-only search with Number, then casts it to PostgreSQL int in list/export queries. No int32 bound check is present. Very large input can fail instead of behaving as an ordinary text search. | Reproduce both list and export paths in memory; agree on bounded-ID versus text-search behavior without widening office scope. |
| Moderation versus grouping lock order | [ModerationService](../api/src/admin/moderation.service.ts) updates the report then, for quarantine, the ticket; [grouping](../api/src/admin/ticket-grouping.service.ts) locks tickets in ascending order before reports. This is an inverse-lock-order risk, not a reproduced production deadlock in this review. | A multi-session PostgreSQL schedule/reproduction, followed by an agreed common lock order. Single-connection PGlite does not prove this property. |
| Work Order creation versus correction | [WorkOrdersService](../api/src/admin/work-orders.service.ts) locks the ticket before assessment checks/creation; [corrections](../api/src/admin/ticket-corrections.service.ts) lock that same ticket before active-order checks. The originally parked creation/correction race is not established as still present. | Test concurrent schedules and eligibility rechecks before calling it fixed or defective; do not remove existing locks based on a static review. |
| Neon pool recovery after ECONNRESET | [DbModule](../api/src/db/db.module.ts) constructs postgres.js with max 10 and otherwise uses library defaults. This pass did not disrupt connections, measure recovery or test safe retry of writes. | Controlled disposable/local transport-failure tests; distinguish connection recovery, GET retries and duplicate-write risk. Do not add blanket write retries or operate production to reproduce it. |

## Interface and notification behavior

| Item | Current evidence and practical limit | Before proposing a fix |
| --- | --- | --- |
| Merged-away priority badge | [Ticket Detail](../app/admin/tickets/[id]/page.tsx) renders its priority badge independently of the merged-away banner. The old parent is read-only history and excluded from active queues/recalculation; its displayed stored priority can therefore be historical. | Decide whether to label or hide the historical badge; preserve active scoring and history. |
| Single-report merged wording | The same ticket header renders member_count followed by “report(s) merged” for every non-merged-away ticket, including one member. Grouping hint/dialog copy also needs review as a set. | Agree on accurate singular/plural and suggestion-versus-merge wording; do not change grouping eligibility. |
| Resolve dialog retained state | [HorizontalStatusTracker](../components/features/admin/tickets/HorizontalStatusTracker.tsx) keeps ResolveDialog mounted; dialog file/outcome/notes/errors use local state without a reset-on-close effect. Closing and reopening may preserve a draft. This review did not run a new browser interaction. | Verify cancel/reopen, successful resolve and ticket navigation; decide which drafts should reset and prevent accidental duplicate submission. |
| Reject conflict feedback | [RejectTicketPanel](../components/features/admin/tickets/RejectTicketPanel.tsx) uses data.error rather than the common detailed-message handling. Nest error envelopes can make this a generic “Conflict” label; fetch/network failures also need review. | Reproduce an actual409 and connection failure; preserve reason requirements and status guards. |
| Remove/regroup notices | [TicketGroupingService](../api/src/admin/ticket-grouping.service.ts) records grouping audit/provenance but has no citizen-notification dependency/write. A move should not be assumed to generate a citizen notice. | Owner decides event/recipient/message requirements; test multiple reports by one citizen and privacy before adding notifications. |
| Citizen list versus detail merged copy | [Citizen copy helpers](../lib/utils/citizen-report-copy.ts) retain older mergedCopy wording for latestUpdateLine; detail uses trackedTogetherCopy. The copies are not yet fully unified. | Verify both consumers and member-count semantics, then approve copy; never expose another citizen's reference or identity. |
| Potential duplicate progress notices | [Ticket status notices](../api/src/admin/tickets.service.ts) and [notice helpers](../api/src/notifications/citizen-notices.ts) provide per-ticket recipient handling. This review did not establish a duplicate “meaningful progress” event. Work Order status writes have their own audit/history; they are not proof of a citizen-notice duplicate. | Inventory actual event producers and overlapping transitions, reproduce recipient counts and distinguish intentionally different events before deduplicating. |
| Focal notification links | Already addressed: [report submission](../api/src/reports/reports.service.ts) creates `/admin/focal/intake/{id}` links, its unit test pins the URL, and [Next redirects](../next.config.ts) route legacy `/admin/intake/{id}` links to the page. The last full suite covered the old-link navigation. | No new fix proposed; retain current unit/browser coverage. |

## Export and audit scope

| Item | Current evidence and practical limit | Before proposing a fix |
| --- | --- | --- |
| Export assignee email | [ReportsService](../api/src/admin/reports.service.ts) includes Assigned Admin Email in Work Order CSV, constrained by operational office access. Flagged CSV uses tracking reference and does not include assignee email/citizen identity/title. Neither export includes internal Work Order note bodies. | Owner decides whether same-office assignee email is required; preserve office filtering, row cap, formula neutralisation and safe export audit. Do not misreport this as a current citizen/public leak. |
| Context retry/refresh audit | Staff [hazard retry](../api/src/domain/hazard-information.service.ts) and [rainfall refresh](../api/src/domain/rainfall-context.service.ts) enforce access/state/throttle rules and persist context, but have no explicit administrative audit-service call. Background lookups and user-requested retries are distinct. | Decide which manual attempts/successes/failures warrant audit and what safe metadata to store; preserve append-only history, provider redaction and non-blocking advisory behavior. |

## Runtime, verification and ownership

- Node24 CI previously aborted in native V8 Wasm reclamation. The approved
  migration-chain-child-only workaround passed local/CI verification;
  [migration coverage](migration-test-coverage.md) records the upstream evidence,
  memory tradeoff and removal criteria. This is not a guarantee against every
  native/runtime failure.
- Broad API type-check/lint retains known findings, not zero findings. Playwright
  is serial, mutates the disposable copy and consumes15 report slots; it does not
  run in CI. Provider reachability and multi-session lock scheduling are not
  established by in-memory passes. See [testing](testing.md).
- Production test-data inventory is design/read-only work. Candidate/reference
  counts are not deletion approval. No cleanup is implemented or authorized by
  this file. Reviewed candidates, an owner backup and explicit approval are
  separate; never delete audit-referenced records.
- Deployment/provider checks, groupmate communication and eventual backup-branch
  cleanup remain owner tasks. Final production verification is read-only. Do
  not infer permission to send messages, stop servers or change production from
  this register.
