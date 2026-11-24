import assert from "node:assert/strict";
import test from "node:test";
import { reportProgress } from "./report-progress";

const states = (status: string, reached: string[]) => reportProgress(status, reached).stages.map((s) => `${s.label}:${s.state}`);

test("a new report is current at Reported with everything after it upcoming", () => {
  assert.deepEqual(states("Reported", []), ["Reported:current", "Under Review:upcoming", "In Progress:upcoming", "Resolved:upcoming"]);
});

test("stages the ticket entered are done; a stage it never entered is skipped, not done", () => {
  assert.deepEqual(states("In Progress", ["In Progress"]), ["Reported:done", "Under Review:skipped", "In Progress:current", "Resolved:upcoming"]);
  assert.deepEqual(states("Resolved", ["Under Review", "In Progress", "Resolved"]), ["Reported:done", "Under Review:done", "In Progress:done", "Resolved:current"]);
});

test("back under review after a resolution shows Under Review as current, Resolved as upcoming again", () => {
  assert.deepEqual(states("Under Review", ["Under Review", "Resolved"]), ["Reported:done", "Under Review:current", "In Progress:upcoming", "Resolved:upcoming"]);
});

test("a rejection keeps all four stages, marks where it exited, and never shows Resolved", () => {
  const rejected = reportProgress("Rejected", ["Under Review", "Rejected"]);
  assert.equal(rejected.rejected, true);
  assert.deepEqual(rejected.stages.map((s) => `${s.label}:${s.state}`), ["Reported:done", "Under Review:rejected", "In Progress:inactive", "Resolved:inactive"]);
  assert.deepEqual(states("Rejected", ["Rejected"]), ["Reported:rejected", "Under Review:inactive", "In Progress:inactive", "Resolved:inactive"]);
});
