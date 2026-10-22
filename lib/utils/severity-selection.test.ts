import assert from "node:assert/strict";
import test from "node:test";
import { SEVERITIES, SEVERITY_DESCRIPTIONS } from "./validation";
import {
  NO_SEVERITY,
  chooseAnotherLevel,
  chooseSeverity,
  confirmCritical,
  needsCriticalConfirmation,
} from "./severity-selection";

test("every severity level has the manuscript description", () => {
  assert.deepEqual(Object.keys(SEVERITY_DESCRIPTIONS), [...SEVERITIES]);
  assert.deepEqual(SEVERITY_DESCRIPTIONS, {
    Low: "Minor impact. Normal access or use is mostly unaffected.",
    Medium: "Noticeable impact. Access or use is still possible with caution.",
    High: "Major disruption or a clear safety concern.",
    Critical: "Immediate serious danger, or the area or service is effectively blocked or unusable.",
  });
});

test("Low, Medium and High are selected straight away, with nothing to confirm", () => {
  for (const level of ["Low", "Medium", "High"] as const) {
    const state = chooseSeverity(NO_SEVERITY, level);
    assert.deepEqual(state, { severity: level, criticalConfirmed: false, confirming: null });
    assert.equal(needsCriticalConfirmation(state), false);
  }
});

test("choosing Critical selects it and asks, remembering the previous level", () => {
  const state = chooseSeverity(chooseSeverity(NO_SEVERITY, "High"), "Critical");
  assert.deepEqual(state, { severity: "Critical", criticalConfirmed: false, confirming: { previous: "High" } });
  assert.equal(needsCriticalConfirmation(state), true);
});

test("Choose another level puts back the previous level, or none", () => {
  const fromHigh = chooseAnotherLevel(chooseSeverity(chooseSeverity(NO_SEVERITY, "High"), "Critical"));
  assert.deepEqual(fromHigh, { severity: "High", criticalConfirmed: false, confirming: null });
  assert.equal(needsCriticalConfirmation(fromHigh), false);

  const fromNone = chooseAnotherLevel(chooseSeverity(NO_SEVERITY, "Critical"));
  assert.deepEqual(fromNone, NO_SEVERITY);
});

test("Yes, it's Critical keeps Critical and allows submitting", () => {
  const state = confirmCritical(chooseSeverity(chooseSeverity(NO_SEVERITY, "Low"), "Critical"));
  assert.deepEqual(state, { severity: "Critical", criticalConfirmed: true, confirming: null });
  assert.equal(needsCriticalConfirmation(state), false);
});

test("a confirmed Critical changed away and back is asked again", () => {
  const confirmed = confirmCritical(chooseSeverity(NO_SEVERITY, "Critical"));
  const away = chooseSeverity(confirmed, "Medium");
  assert.equal(away.criticalConfirmed, false);
  const back = chooseSeverity(away, "Critical");
  assert.deepEqual(back, { severity: "Critical", criticalConfirmed: false, confirming: { previous: "Medium" } });
  assert.equal(needsCriticalConfirmation(back), true);
});

test("choosing the level that is already selected changes nothing", () => {
  const confirmed = confirmCritical(chooseSeverity(NO_SEVERITY, "Critical"));
  assert.equal(chooseSeverity(confirmed, "Critical"), confirmed);
  const asking = chooseSeverity(NO_SEVERITY, "Critical");
  assert.equal(chooseSeverity(asking, "Critical"), asking);
});

test("confirming or choosing another level with no question open changes nothing", () => {
  const high = chooseSeverity(NO_SEVERITY, "High");
  assert.equal(confirmCritical(high), high);
  assert.equal(chooseAnotherLevel(high), high);
});
