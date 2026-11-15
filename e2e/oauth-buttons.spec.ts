import { expect, test } from "@playwright/test";

test("citizen login page renders a Google button that navigates to the API OAuth route", async ({ page }) => {
  await page.goto("/login");
  const google = page.getByRole("link", { name: "Continue with Google" });
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute("href", "/api/auth/google");
});

test("citizen signup page renders a Google button that navigates to the API OAuth route", async ({ page }) => {
  await page.goto("/signup");
  const google = page.getByRole("link", { name: "Continue with Google" });
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute("href", "/api/auth/google");
});

test("admin login page has no OAuth buttons — admin auth stays local-password only", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
});

// The API's own reason, not the HTTP status name ("Unauthorized", "Bad
// Request"). Unknown emails, so no real account's failed-login count moves.
// (Sign-up gets the same handling, but every attempt counts against the
// 20-an-hour signup limit, so it is not exercised here.)
test("sign-in forms show the API's reason, not the status name", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("e2e-nobody@porac.gov.ph");
  await page.getByPlaceholder("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e-nobody@porac.ph");
  await page.getByPlaceholder("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign In with Email" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});

test("citizen login page shows a safe message for each OAuth error code", async ({ page }) => {
  const banner = page.locator('p[role="alert"]');

  await page.goto("/login?error=account_link_required");
  await expect(banner).toContainText("account with this email already exists");

  await page.goto("/login?error=email_required");
  await expect(banner).toContainText("public email");

  await page.goto("/login?error=oauth_cancelled");
  await expect(banner).toContainText("cancelled");

  await page.goto("/login?error=oauth_failed");
  await expect(banner).toContainText("Something went wrong");

  // An unrecognized code must never leak raw text onto the page.
  await page.goto("/login?error=some_raw_provider_error");
  await expect(banner).toHaveCount(0);
});
