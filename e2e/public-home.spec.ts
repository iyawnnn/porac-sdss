import { expect, test } from "@playwright/test";

// `/` is the public front door (it used to redirect to /login): it must render for a
// signed-out visitor and lead to both citizen entry points and, discreetly, to staff sign-in.
test("the public home page renders at / and links to sign in, create account and staff access", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Report local concerns" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Citizen Sign In" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "Create Account" })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "Staff access" })).toHaveAttribute("href", "/admin/login");
  // Nothing to go back to from the home page itself.
  await expect(page.getByRole("link", { name: "Back to Home" })).toHaveCount(0);
});

test("Back to Home on every auth page returns to the public home page", async ({ page }) => {
  for (const path of ["/login", "/signup", "/forgot-password", "/admin/login"]) {
    await page.goto(path);
    const back = page.getByRole("link", { name: "Back to Home" });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Report local concerns" })).toBeVisible();
  }
});

// The decorative duplicate of the button label must not be announced: the accessible
// name is the label alone, not the label twice.
test("primary buttons expose a single accessible label", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toHaveCount(1);
  await expect(page.locator("button[type=submit] [aria-hidden=true]")).toHaveText("Sign In");
});
