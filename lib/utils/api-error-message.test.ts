import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorMessage } from "./api-error-message";

// Manuscript revision Phase 5, step 5c: the resolve dialog and the Return to
// Under Review panel show the API's own refusal text (Nest's `message`),
// never the status name in `error`.

test("shows the API's message, not the status name", () => {
  assert.equal(
    apiErrorMessage(
      { statusCode: 409, error: "Conflict", message: "Ticket #7 has 1 active Work Order. Complete or cancel it before resolving the ticket." },
      "fallback",
    ),
    "Ticket #7 has 1 active Work Order. Complete or cancel it before resolving the ticket.",
  );
});

test("joins a list of validation messages", () => {
  assert.equal(apiErrorMessage({ message: ["a", "b"] }, "fallback"), "a b");
});

test("shows the first named Zod field error", () => {
  assert.equal(
    apiErrorMessage({ formErrors: [], fieldErrors: { title: ["Must contain at least 1 character"] } }, "fallback"),
    "title: Must contain at least 1 character",
  );
});

test("uses the supplied 429 fallback when the API has no message", () => {
  const fallback = "Too many reports were submitted from this network. Please try again later.";
  assert.equal(apiErrorMessage({ statusCode: 429, error: "Too Many Requests" }, fallback), fallback);
});

test("falls back when there is no usable message", () => {
  assert.equal(apiErrorMessage(null, "fallback"), "fallback");
  assert.equal(apiErrorMessage({ error: "Conflict" }, "fallback"), "fallback");
  assert.equal(apiErrorMessage({ message: "" }, "fallback"), "fallback");
  assert.equal(apiErrorMessage("not json", "fallback"), "fallback");
});
