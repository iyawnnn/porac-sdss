import { expect, test } from "@playwright/test";

// Next's route announcer is also role="alert", so target the form's own Alert.
const formAlert = (page: import("@playwright/test").Page) => page.locator("[data-slot=alert][role=alert]");

// Submit states of the primary auth button. Every request is mocked, so no real sign-in is
// attempted and nothing counts against a rate limit.

test("sign-in shows a spinner while pending, sends one request, and restores the button on error", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/citizens/login", async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Invalid email or password" }) });
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill("someone@example.test");
  await page.getByPlaceholder("Password").fill("wrong-password");

  const idle = page.getByRole("button", { name: "Sign In", exact: true });
  const idleBox = await idle.boundingBox();
  await expect(idle.locator("[data-slot=spinner]")).toHaveCount(0);

  await idle.click();
  const busy = page.getByRole("button", { name: "Signing in…" });
  await expect(busy).toBeDisabled();
  await expect(busy).toHaveAttribute("aria-busy", "true");
  await expect(busy.locator("[data-slot=spinner]")).toBeVisible();
  // Same size while loading; the spinner is decorative and the label is announced once.
  const busyBox = await busy.boundingBox();
  expect([busyBox?.width, busyBox?.height]).toEqual([idleBox?.width, idleBox?.height]);
  await expect(busy.locator("[data-slot=spinner]")).toHaveAttribute("aria-hidden", "true");
  // The spinner follows the label (to its right), on the same line.
  const spinnerBox = await busy.locator("[data-slot=spinner]").boundingBox();
  const labelBox = await busy.locator("span.relative").boundingBox();
  expect(spinnerBox!.x + spinnerBox!.width).toBeGreaterThan(labelBox!.x + labelBox!.width - 1);
  expect(spinnerBox!.x).toBeGreaterThan(labelBox!.x);
  await expect(page.locator("main [role=status].sr-only")).toHaveText("Signing in…");

  // Enter in a field and a forced click while pending must not resubmit.
  await page.getByPlaceholder("Password").press("Enter");
  await busy.click({ force: true, noWaitAfter: true }).catch(() => {});

  await expect(formAlert(page)).toContainText("Invalid email or password");
  const restored = page.getByRole("button", { name: "Sign In", exact: true });
  await expect(restored).toBeEnabled();
  await expect(restored).not.toHaveAttribute("aria-busy", "true");
  await expect(restored.locator("[data-slot=spinner]")).toHaveCount(0);
  expect(requests).toBe(1);
});

// Forgot and reset used to have no catch around fetch: a network failure left the button
// loading forever with no message.
test("a network failure restores the forgot-password button and shows an error", async ({ page }) => {
  await page.route("**/api/citizens/forgot-password", (route) => route.abort("connectionrefused"));
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("someone@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(formAlert(page)).toContainText("Could not reach the server");
  const button = page.getByRole("button", { name: "Send reset link" });
  await expect(button).toBeEnabled();
  await expect(button.locator("[data-slot=spinner]")).toHaveCount(0);
});

test("a network failure restores the reset-password button and shows an error", async ({ page }) => {
  await page.route("**/api/citizens/reset-password/validate**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ valid: true }) }));
  await page.route("**/api/citizens/reset-password", (route) => route.abort("connectionrefused"));
  await page.goto("/reset-password?token=e2e-token");
  await page.getByPlaceholder("At least 8 characters").fill("a-long-enough-password");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(formAlert(page)).toContainText("Could not reach the server");
  await expect(page.getByRole("button", { name: "Reset password" })).toBeEnabled();
});
