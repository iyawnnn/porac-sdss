import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminAccessDenied } from "./AdminAccessDenied";

test("access denied explains the refusal and links to the role-aware home without retry wording", () => {
  const html = renderToStaticMarkup(<AdminAccessDenied />).replaceAll("&#x27;", "'");
  assert.match(html, /role="alert"/);
  assert.ok(html.includes("You don't have access to this page."));
  assert.match(html, /href="\/admin"[^>]*>Back to home<\/a>/);
  assert.doesNotMatch(html, /retry|reload|unavailable|went wrong|couldn.t load/i);
});
