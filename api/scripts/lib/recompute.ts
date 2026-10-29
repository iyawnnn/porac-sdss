import { sql } from "../db";
import { OperationalPriorityService } from "../../src/domain/operational-priority.service";

// Seed-side Operational Priority recalculation (tickets.priority_index only):
// the API's own OperationalPriorityService run over this script client, so
// seeds and the app share one query and one severity rule — the median of
// the member reports (api/src/common/utils/severity.ts, manuscript revision
// Phase 4, step 4a; it was a copy with the old MAX rule). Hazard Urgency
// (rain, elevation bounds, the urgency formula and its columns) was removed
// in manuscript revision Phase 1, step 7b — this used to be
// recomputeActiveTicketUrgency and also wrote the Hazard Urgency columns.
export async function recalculateActivePriority() {
  return new OperationalPriorityService(sql).recalculateActiveTickets();
}
