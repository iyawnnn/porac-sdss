import assert from "node:assert/strict";
import test from "node:test";
import { REFERENCE_NOT_FOUND, normalizeReferenceInput } from "./tracking-reference";

// Manuscript revision Phase 6, step 6b: the My Reports reference search.
test("accepts a PRC reference, trimmed and upper-cased", () => {
  assert.equal(normalizeReferenceInput("PRC-2026-000123"), "PRC-2026-000123");
  assert.equal(normalizeReferenceInput("  prc-2026-1234567 "), "PRC-2026-1234567");
});

test("rejects anything that can never be a reference", () => {
  for (const input of ["", "123", "PRC-2026-12345", "PRC-26-000123", "ABC-2026-000123", "PRC-2026-0001234567890"]) {
    assert.equal(normalizeReferenceInput(input), null, input);
  }
});

test("the not-found message is neutral and matches the API's", () => {
  assert.equal(REFERENCE_NOT_FOUND, "No report found with that reference.");
});
