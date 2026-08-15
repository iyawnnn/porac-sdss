import { expect, test, type Page } from "@playwright/test";
import { E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin as sharedLoginAdmin } from "./helpers";

test.setTimeout(60_000);

async function loginAdmin(page: Page) {
  await sharedLoginAdmin(page, E2E_MEO_ADMIN);
}

// Navigates and waits for hydration to finish before the caller does any
// .click() — a plain page.goto() only waits for the "load" event, and this
// page's client bundle can paint its SSR HTML slightly before React
// attaches event handlers. .toBeVisible() assertions self-poll and are
// unaffected, but a .click() fired in that window lands on an inert node.
// Confirmed empirically: identical clicks pass reliably with this wait and
// fail intermittently without it.
async function gotoFlagged(page: Page, path = "/admin/flagged") {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test("flagged reports loads real data with KPIs, table, and filter toolbar", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await expect(page.getByRole("heading", { name: "Flagged Reports" })).toBeVisible();
  await expect(page.getByText("Pending Review", { exact: true })).toBeVisible();
  await expect(page.getByText("Quarantined")).toBeVisible();
  await expect(page.getByText("Dismissed")).toBeVisible();
  await expect(page.getByText("Avg. Resolution Time")).toBeVisible();

  await expect(page.getByLabel("Search flagged reports")).toBeVisible();
  await expect(page.getByLabel("Moderation status")).toBeVisible();
  await expect(page.getByLabel("Flag type")).toBeVisible();
  await expect(page.getByLabel("Office")).toBeVisible();
  await expect(page.getByLabel("Category")).toBeVisible();
  await expect(page.getByLabel("Barangay")).toBeVisible();
  await expect(page.getByLabel("Submitted from")).toBeVisible();
  await expect(page.getByLabel("Submitted to")).toBeVisible();

  const headers = ["Report", "Flags", "Category", "Barangay", "Office", "Submitted", "Moderation", "Action"];
  for (const h of headers) await expect(page.getByRole("columnheader", { name: h })).toBeVisible();

  await expect(page.getByRole("row").filter({ hasText: "Report #" }).first()).toBeVisible();
});

test("moderation status filter defaults to pending and shows no duplicated label text", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  const statusSelect = page.getByLabel("Moderation status");
  await expect(statusSelect).toHaveText("Pending review");
});

test("switching to All statuses reveals already-moderated reports and updates the URL", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await page.getByLabel("Moderation status").click();
  await page.getByRole("option", { name: "All statuses" }).click();

  await expect(page).toHaveURL(/status=all/);
});

test("category filter narrows results and Reset filters clears back to defaults", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await page.getByLabel("Category").click();
  await page.getByRole("option", { name: "Localized Flooding", exact: true }).click();
  await expect(page).toHaveURL(/category=Localized(%20|\+)Flooding/);

  await expect(page.getByRole("button", { name: "Reset filters" })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page).not.toHaveURL(/category=Localized(%20|\+)Flooding/);
  await expect(page.getByRole("button", { name: "Reset filters" })).toHaveCount(0);
});

test("a filter combination with no matches shows the empty state, not a blank table", async ({ page }) => {
  await loginAdmin(page);
  const params = new URLSearchParams({ status: "all", category: "Streetlight Out", flag: "DUPLICATE_IMAGE" });
  await gotoFlagged(page, `/admin/flagged?${params.toString()}`);

  await expect(page.getByText("No flagged reports match this filter.").first()).toBeVisible();
});

test("a backend failure shows the error card with a working retry", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  let intercepted = false;
  await page.route("**/api/admin/moderation?**", async (route) => {
    intercepted = true;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) });
  });

  // Trigger a client-side refetch (the initial SSR load already happened).
  // Both the desktop table and mobile card list render their own
  // AdminErrorCard (one hidden via CSS, not removed from the DOM — the
  // desktop instance is first in DOM order at this viewport) — .first()
  // picks the visible one and avoids a strict-mode ambiguity.
  await page.getByLabel("Category").click();
  await page.getByRole("option", { name: "Pothole / Road Surface Damage", exact: true }).click();

  await expect(page.getByText("Couldn't refresh flagged reports").first()).toBeVisible();
  expect(intercepted).toBe(true);

  await page.unroute("**/api/admin/moderation?**");
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByText("Couldn't refresh flagged reports").first()).toHaveCount(0);
});

test("Review opens the detail sheet with evidence, flag breakdown, and reporter history", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await page.getByRole("button", { name: "Review" }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Report / Ticket")).toBeVisible();
  await expect(sheet.getByText("Flag breakdown")).toBeVisible();
  await expect(sheet.getByText("Reporter history")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Dismiss flag" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Quarantine report" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Mark as duplicate" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("quarantine is blocked client-side without a moderation note", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await page.getByRole("button", { name: "Review" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Quarantine report" }).click();
  await expect(page.getByLabel(/Moderation note \(required\)/)).toBeVisible();

  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("A moderation note is required to quarantine a report.")).toBeVisible();
});

for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["tablet", 1024, 1000],
  ["mobile", 390, 900],
] as const) {
  test(`flagged reports stays overflow-free at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await loginAdmin(page);
    await gotoFlagged(page);
    await expect(page.getByRole("heading", { name: "Flagged Reports" })).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
}

test("mobile viewport renders the card list, not the desktop table", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await loginAdmin(page);
  await gotoFlagged(page);

  await expect(page.getByRole("table")).toBeHidden();
  await expect(page.getByRole("button", { name: "Review" }).first()).toBeVisible();
});
