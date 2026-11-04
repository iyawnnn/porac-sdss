import assert from "node:assert/strict";
import test from "node:test";
import { CITIZEN_NOTIFICATION_TYPES } from "../types/citizens-notifications";

test("all five new citizen notification types have a readable bell label", () => {
  assert.deepEqual({
    ticket_reassigned: CITIZEN_NOTIFICATION_TYPES.ticket_reassigned,
    ticket_referred: CITIZEN_NOTIFICATION_TYPES.ticket_referred,
    ticket_returned_to_review: CITIZEN_NOTIFICATION_TYPES.ticket_returned_to_review,
    ticket_acknowledged: CITIZEN_NOTIFICATION_TYPES.ticket_acknowledged,
    resolution_feedback_received: CITIZEN_NOTIFICATION_TYPES.resolution_feedback_received,
  }, {
    ticket_reassigned: "Report routed",
    ticket_referred: "Report referred",
    ticket_returned_to_review: "Back under review",
    ticket_acknowledged: "Report acknowledged",
    resolution_feedback_received: "Feedback received",
  });
  assert.equal(CITIZEN_NOTIFICATION_TYPES.report_acknowledged, "Report acknowledged");
});
