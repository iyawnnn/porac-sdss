import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.waitForTimeout(500);
  await page.getByLabel("Email").fill("meo@porac.gov.ph");
  await page.getByPlaceholder("Password").fill("PoracDemo2026!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("admin shell renders grouped navigation with Dashboard active by default", async ({ page }) => {
  await loginAdmin(page);

  const nav = page.getByRole("navigation");
  await expect(nav.getByText("Main workspace")).toBeVisible();
  await expect(nav.getByText("Moderation")).toBeVisible();
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Ticket Queue" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Interactive Map" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Flagged Reports" })).toBeVisible();

  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Ticket Queue" })).not.toHaveAttribute("aria-current", "page");
});

test("active route state updates on navigation, including nested ticket-detail routes", async ({ page }) => {
  await loginAdmin(page);
  const nav = page.getByRole("navigation");

  await nav.getByRole("link", { name: "Ticket Queue" }).click();
  await expect(page).toHaveURL(/\/admin\/tickets(\?|$)/);
  await expect(nav.getByRole("link", { name: "Ticket Queue" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");

  // Nested route (/admin/tickets/:id) must keep the parent "Ticket Queue" item active.
  const firstTicketLink = page.getByRole("link", { name: "View ticket" }).first();
  await firstTicketLink.click();
  await expect(page).toHaveURL(/\/admin\/tickets\/\d+/);
  await expect(nav.getByRole("link", { name: "Ticket Queue" })).toHaveAttribute("aria-current", "page");
});

test("mobile sidebar opens via trigger and closes after navigating", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAdmin(page);

  // Sidebar renders inside a Sheet dialog on mobile — closed by default.
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: /toggle sidebar/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("link", { name: "Ticket Queue" }).click();
  await expect(page).toHaveURL(/\/admin\/tickets(\?|$)/);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("office scope and sign-out controls remain available in the shell", async ({ page }) => {
  await loginAdmin(page);

  await expect(page.getByRole("link", { name: /View full city|View my office/ })).toBeVisible();

  const signOut = page.getByRole("button", { name: "Sign out" });
  await expect(signOut).toBeVisible();
  await signOut.click();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("citizen shell is unaffected by the admin dark shell", async ({ page }) => {
  await page.goto("/login");
  await page.waitForTimeout(500);
  await page.getByLabel("Email").fill("citizen1@porac.ph");
  await page.getByPlaceholder("Password").fill("PoracDemo2026!");
  await page.getByRole("button", { name: "Sign In with Email" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // Citizen canvas token (#F7F9FB) — must stay light regardless of the admin
  // shell's [data-shell="admin"] dark override existing elsewhere in the app.
  expect(canvas).toBe("rgb(247, 249, 251)");
  await expect(page.getByText("Porac SDSS")).toBeVisible();
});
