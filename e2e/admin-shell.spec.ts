import { expect, test, type Page } from "@playwright/test";
import { E2E_CITIZEN_ACCOUNT, E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin as sharedLoginAdmin, loginCitizen as sharedLoginCitizen } from "./helpers";

test.setTimeout(60_000);

async function loginAdmin(page: Page) {
  await sharedLoginAdmin(page, E2E_MEO_ADMIN);
}

test("admin shell uses the approved Efferd navigation structure and real routes only", async ({ page }) => {
  await loginAdmin(page);

  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByText("Main", { exact: true })).toBeVisible();
  await expect(nav.getByText("Management", { exact: true })).toBeVisible();
  await expect(nav.getByLabel("Open command palette")).toBeVisible();

  const expected = ["Dashboard", "Ticket Queue", "Interactive Map", "Barangay Insights", "Work Orders", "Flagged Reports", "Reports & Exports", "Notifications"];
  await expect(nav.getByRole("link")).toHaveCount(expected.length);
  for (const label of expected) await expect(nav.getByRole("link", { name: label })).toBeVisible();
  for (const fake of ["Analytics", "Audit Log", "Events", "Funnels", "Retention"]) {
    await expect(nav.getByText(fake, { exact: true })).toHaveCount(0);
  }

  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  const sidebarColor = await page.locator('[data-slot="sidebar-inner"]').first().evaluate((element) => getComputedStyle(element).backgroundColor);
  // Scoped to the dropdown menu itself — the sidebar now has its own real
  // "Notifications" link (e2e/admin-notifications.spec.ts), so an unscoped
  // getByText would match both and violate Playwright's strict mode.
  await page.getByRole("button", { name: /notifications/i }).click();
  await expect(page.getByRole("menu").getByText("Notifications", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(sidebarColor).not.toBe("rgb(23, 37, 84)");
});

test("sidebar command palette searches and navigates to real destinations", async ({ page }) => {
  await loginAdmin(page);
  await page.getByLabel("Open command palette").click();
  const dialog = page.getByRole("dialog", { name: "Admin navigation" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Search navigation...").fill("map");
  await dialog.getByRole("option", { name: "Interactive Map" }).click();
  await expect(page).toHaveURL(/\/admin\/map/);
  await expect(page.getByRole("dialog", { name: "Admin navigation" })).toHaveCount(0);
});

test("command palette shows no results for unmatched queries", async ({ page }) => {
  await loginAdmin(page);
  await page.getByLabel("Open command palette").click();
  const dialog = page.getByRole("dialog", { name: "Admin navigation" });
  await dialog.getByPlaceholder("Search navigation...").fill("zzz-nonexistent");
  await expect(dialog.getByText("No results found.")).toBeVisible();
});

test("command palette opens and closes with Ctrl+K, and closes on Escape", async ({ page }) => {
  await loginAdmin(page);
  const dialog = page.getByRole("dialog", { name: "Admin navigation" });

  await page.keyboard.press("Control+K");
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Control+K");
  await expect(dialog).toHaveCount(0);

  await page.keyboard.press("Control+K");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("command palette supports arrow-key navigation and Enter to select", async ({ page }) => {
  await loginAdmin(page);
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Admin navigation" });
  await dialog.getByPlaceholder("Search navigation...").fill("flagged");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/flagged/);
  await expect(page.getByRole("dialog", { name: "Admin navigation" })).toHaveCount(0);
});

test("Ctrl+K does not fire while typing in an input or textarea", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/tickets");
  const filterInput = page.getByPlaceholder("Search by ticket ID, title, or barangay...");
  await filterInput.click();
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Admin navigation" })).toHaveCount(0);
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
  await expect(dialog.getByLabel("Open command palette")).toBeVisible();

  await dialog.getByRole("link", { name: "Ticket Queue" }).click();
  await expect(page).toHaveURL(/\/admin\/tickets(\?|$)/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("office scope and sign-out remain functional", async ({ page }) => {
  await loginAdmin(page);
  // Office admins get a fixed, non-interactive office label, not a
  // switchable "view all offices" control — see AdminSidebar.tsx.
  await expect(page.getByText(`My Office: ${E2E_MEO_ADMIN.office}`)).toBeVisible();
  await expect(page.getByRole("link", { name: /View full city|View my office/ })).toHaveCount(0);

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
  await sharedLoginCitizen(page, E2E_CITIZEN_ACCOUNT);

  const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(canvas).toBe("rgb(247, 249, 251)");
  await page.getByRole("button", { name: /notifications/i }).click();
  await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Notifications", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Porac SDSS")).toBeVisible();
});
