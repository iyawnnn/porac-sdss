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

// The primary button has one real label that never moves: hovering and pressing must not
// shift it, and there is no duplicated (rolling) copy. Hover and press do recolor it, so the
// interactivity is visible without relying on the reflection.
test("the primary button changes color but never moves on hover and press", async ({ page }) => {
  await page.goto("/login");
  const button = page.getByRole("button", { name: "Sign In", exact: true });
  await expect(button).toHaveCount(1);
  await expect(page.locator("button[type=submit] [aria-hidden=true]")).toHaveCount(0);
  const rest = await button.evaluate((e) => getComputedStyle(e).backgroundColor);
  const before = await button.boundingBox();
  await button.hover();
  await expect.poll(() => button.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(rest);
  const hover = await button.evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.mouse.down();
  await expect.poll(() => button.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(hover);
  expect(await button.boundingBox()).toEqual(before);
  // Release away from the button so no sign-in is submitted.
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect.poll(() => button.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(rest);
});

// The show/hide toggle sits inside the field; it used to drop ~17px while pressed.
test("the password visibility toggle does not move when pressed", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password", { exact: true }).fill("a-password-value");
  const toggle = page.getByRole("button", { name: "Show password" });
  const before = await toggle.boundingBox();
  await toggle.hover();
  await page.mouse.down();
  expect(await toggle.boundingBox()).toEqual(before);
  await page.mouse.up();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.getByRole("button", { name: "Hide password" }).boundingBox()).toEqual(before);
});
