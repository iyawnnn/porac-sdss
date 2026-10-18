// NOT used by the API any more. Manuscript revision Phase 1, step 3 removed
// automatic grouping from ReportsService.submit, and the manuscript has no
// 7-day matching window (handoff Decision 1). Kept only because two seed
// scripts (scripts/seed/seed-bulk-reports.ts, seed-demo-presentation.ts)
// still import it; delete it with the Phase 8 seed rework. Phase 3's
// candidate search must not use it.
//
// PLAN.md §6: how recently a candidate ticket must have been created to
// still accept a new report merge. Anchored to the ticket's original
// tickets.created_at — merging additional reports does not slide or
// extend this window. A code constant, not an env var: nothing in the
// business rule requires it to vary by deployment.
export const DUPLICATE_MERGE_WINDOW_DAYS = 7;
