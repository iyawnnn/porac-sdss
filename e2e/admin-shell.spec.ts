import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);

async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("meo@porac.gov.ph");
  await page.getByPlaceholder("Password").fill("PoracDemo2026!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Incident Reports Over Time")).toBeVisible();
}

test("admin shell uses the approved Efferd navigation structure and real routes only", async ({ page }) => {
  await loginAdmin(page);

  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByText("Main", { exact: true })).toBeVisible();
  await expect(nav.getByText("Management", { exact: true })).toBeVisible();
  await expect(nav.getByLabel("Search navigation")).toBeVisible();

  const expected = ["Dashboard", "Ticket Queue", "Interactive Map", "Flagged Reports"];
  await expect(nav.getByRole("link")).toHaveCount(expected.length);
  for (const label of expected) await expect(nav.getByRole("link", { name: label })).toBeVisible();
  for (const fake of ["Analytics", "Audit Log", "Events", "Funnels", "Retention"]) {
    await expect(nav.getByText(fake, { exact: true })).toHaveCount(0);
  }

  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  const sidebarColor = await page.locator('[data-slot="sidebar-inner"]').first().evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(sidebarColor).not.toBe("rgb(23, 37, 84)");
});

test("sidebar search filters real navigation destinations", async ({ page }) => {
  await loginAdmin(page);
  const search = page.getByLabel("Search navigation");
  await search.fill("map");
  const results = page.getByRole("list", { name: "Navigation search results" });
  await expect(results.getByRole("link", { name: "Interactive Map" })).toBeVisible();
  await results.getByRole("link", { name: "Interactive Map" }).click();
  await expect(page).toHaveURL(/\/admin\/map/);
});

test("active route state updates on navigation, including nested ticket-detail routes", async ({ page }) => {
  await loginAdmin(page);
  const nav = page.getByRole("navigation", { name: "Admin" });

  await nav.getByRole("link", { name: "Ticket Queue" }).click();
  await expect(page).toHaveURL(/\/admin\/tickets(\?|$)/);
  await expect(nav.getByRole("link", { name: "Ticket Queue" })).toHaveAttribute("aria-current", "page");

  const firstTicketLink = page.getByRole("link", { name: "View ticket" }).first();
  await firstTicketLink.click();
  await expect(page).toHaveURL(/\/admin\/tickets\/\d+/);
  await expect(nav.getByRole("link", { name: "Ticket Queue" })).toHaveAttribute("aria-current", "page");
});

test("mobile sidebar opens, remains usable, and closes after navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAdmin(page);

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /toggle sidebar/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Search navigation")).toBeVisible();

  await dialog.getByRole("link", { name: "Ticket Queue" }).click();
  await expect(page).toHaveURL(/\/admin\/tickets(\?|$)/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("office scope and sign-out remain functional", async ({ page }) => {
  await loginAdmin(page);
  await expect(page.getByRole("link", { name: /View full city|View my office/ })).toBeVisible();

  await page.getByRole("button", { name: "Open administrator menu" }).click();
  const signOut = page.getByRole("menuitem", { name: "Sign out" });
  await expect(signOut).toBeVisible();
  await signOut.click();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("rendered admin routes contain no mojibake", async ({ page }) => {
  await loginAdmin(page);
  for (const path of ["/admin", "/admin/tickets", "/admin/map", "/admin/flagged"]) {
    await page.goto(path);
    await expect(page.locator("body")).not.toContainText(/\u00c3|\u00c2/);
  }
});

test("citizen shell remains light and independent of the neutral admin shell", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("citizen1@porac.ph");
  await page.getByPlaceholder("Password").fill("PoracDemo2026!");
  await page.getByRole("button", { name: "Sign In with Email" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(canvas).toBe("rgb(247, 249, 251)");
  await expect(page.getByText("Porac SDSS")).toBeVisible();
});
