import assert from "node:assert/strict";
import test from "node:test";
import { EMERGENCY_NOTICE_BODY, EMERGENCY_NOTICE_TITLE } from "./emergency-notice";

// Manuscript revision Phase 6, step 6a: the group's final wording, word for
// word.
test("the emergency notice uses the final wording", () => {
  assert.equal(EMERGENCY_NOTICE_TITLE, "For non-emergency concerns only");
  assert.equal(
    EMERGENCY_NOTICE_BODY,
    "PORAC-SDSS does not replace emergency hotlines, QRT communication channels or established emergency-dispatch procedures. If you or someone else is in immediate danger, contact the appropriate emergency service right away.",
  );
});

test("the emergency notice carries no phone number", () => {
  assert.doesNotMatch(`${EMERGENCY_NOTICE_TITLE} ${EMERGENCY_NOTICE_BODY}`, /\d/);
});
