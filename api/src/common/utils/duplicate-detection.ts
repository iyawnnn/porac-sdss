// PLAN.md §6: how recently a candidate ticket must have been created to
// still accept a new report merge. Anchored to the ticket's original
// tickets.created_at — merging additional reports does not slide or
// extend this window. A code constant, not an env var: nothing in the
// business rule requires it to vary by deployment.
export const DUPLICATE_MERGE_WINDOW_DAYS = 7;
