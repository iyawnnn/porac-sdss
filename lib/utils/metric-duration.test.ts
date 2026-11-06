import assert from "node:assert/strict";
import test from "node:test";
import { metricDuration } from "./metric-duration";

test("metric duration distinguishes missing data, zero and rounded hours/days", () => {
  for (const [hours, expected] of [
    [null, "No data yet"],
    [0, "0 hours"],
    [1, "1 hour"],
    [1.26, "1.3 hours"],
    [24, "1 day"],
    [60, "2.5 days"],
  ] as const) {
    assert.equal(metricDuration(hours), expected);
  }
});
