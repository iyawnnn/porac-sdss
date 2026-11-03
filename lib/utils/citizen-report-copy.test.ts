import assert from "node:assert/strict";
import test from "node:test";
import { REFERRED_OUTSIDE_NOTE, officeLabel, outcomeCopy, trackedTogetherCopy } from "./citizen-report-copy";

// Manuscript revision Phase 6, step 6b.
test("the outcome wording never shows a raw code", () => {
  assert.deepEqual(outcomeCopy("HANDLED_BY_MUNICIPALITY"), { label: "Handled by the municipality", note: null });
  assert.deepEqual(outcomeCopy("REFERRED_OUTSIDE"), {
    label: "Referred to an outside agency",
    note: "The municipality's handling is complete. The agency may not have resolved the issue yet.",
  });
  assert.equal(REFERRED_OUTSIDE_NOTE, "The municipality's handling is complete. The agency may not have resolved the issue yet.");
});

test("no outcome (unresolved, or a legacy Resolved ticket) has no label", () => {
  assert.equal(outcomeCopy(null), null);
});

test("the merged banner counts the other reports, singular and plural", () => {
  assert.equal(trackedTogetherCopy(1), "Now tracked together with 1 other report.");
  assert.equal(trackedTogetherCopy(3), "Now tracked together with 3 other reports.");
});

test("office names are the full names", () => {
  assert.equal(officeLabel("MEO"), "Municipal Engineering Office");
  assert.equal(officeLabel("MDRRMO"), "Municipal Disaster Risk Reduction and Management Office");
});
