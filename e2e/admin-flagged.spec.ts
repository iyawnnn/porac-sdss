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

// The seven filters live inside a popover since the Precision Queue rebuild —
// they are not in the DOM until the trigger is clicked, so every filter
// assertion has to open it first.
async function openFilters(page: Page) {
  await page.getByRole("button", { name: "Filters" }).click();
}

test("flagged reports loads real data with KPIs, table, and filter toolbar", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await expect(page.getByRole("heading", { name: "Flagged Reports" })).toBeVisible();
  await expect(page.getByText("Pending review", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Quarantined").first()).toBeVisible();
  await expect(page.getByText("Dismissed").first()).toBeVisible();
  await expect(page.getByText("Avg. resolution time")).toBeVisible();

  await expect(page.getByLabel("Search flagged reports")).toBeVisible();

  await openFilters(page);
  await expect(page.getByLabel("Moderation status")).toBeVisible();
  await expect(page.getByLabel("Flag type")).toBeVisible();
  await expect(page.getByLabel("Category")).toBeVisible();
  await expect(page.getByLabel("Barangay")).toBeVisible();
  await expect(page.getByLabel("Submitted from")).toBeVisible();
  await expect(page.getByLabel("Submitted to")).toBeVisible();
  await page.keyboard.press("Escape");

  const headers = ["Report", "Flags", "Category", "Barangay", "Office", "Submitted", "Moderation", "Action"];
  // exact: true matters — the select-all checkbox is also a columnheader, and its
  // aria-label ("Select all flagged reports on this page") substring-matches "Report".
  for (const h of headers) {
    await expect(page.getByRole("columnheader", { name: h, exact: true })).toBeVisible();
  }

  await expect(page.getByRole("row").filter({ hasText: "T#" }).first()).toBeVisible();
});

test("the view-tab strip carries built-in tabs and a save-view affordance", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  for (const tab of ["All flagged", "Pending review", "Quarantined", "Dismissed", "Duplicates"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${tab}`) })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Save this view" })).toBeVisible();
});

test("moderation status filter defaults to pending", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await openFilters(page);
  await expect(page.getByLabel("Moderation status")).toHaveText("Pending review");
});

test("the All flagged tab reveals already-moderated reports and updates the URL", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await page.getByRole("button", { name: /^All flagged/ }).click();

  await expect(page).toHaveURL(/status=all/);
});

test("category filter narrows results, raises a chip, and Reset filters clears it", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await openFilters(page);
  await page.getByLabel("Category").click();
  await page.getByRole("option", { name: "Localized Flooding", exact: true }).click();
  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(/category=Localized(%20|\+)Flooding/);
  await expect(page.getByRole("button", { name: /Category: Localized Flooding/ })).toBeVisible();

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
  await openFilters(page);
  await page.getByLabel("Category").click();
  await page.getByRole("option", { name: "Pothole / Road Surface Damage", exact: true }).click();
  await page.keyboard.press("Escape");

  await expect(page.getByText("Could not load flagged reports").first()).toBeVisible();
  expect(intercepted).toBe(true);

  await page.unroute("**/api/admin/moderation?**");
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByText("Could not load flagged reports").first()).toHaveCount(0);
});

test("the review drawer opens with the risk breakdown, facts, and the three actions", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await page.getByRole("button", { name: /^Review report / }).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Flag breakdown")).toBeVisible();
  await expect(drawer.getByText("Report / Ticket")).toBeVisible();
  await expect(drawer.getByText("Reporter history")).toBeVisible();
  await expect(drawer.getByText(/Deterministic heuristic, not a model score/)).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Dismiss flag" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Quarantine", exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Mark as duplicate" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("quarantine is blocked client-side without a moderation note", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await page.getByRole("button", { name: /^Review report / }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Quarantine", exact: true }).click();
  await expect(page.getByLabel(/Moderation note \(required\)/)).toBeVisible();

  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("A moderation note is required to quarantine a report.")).toBeVisible();
});

// Selection is what gates every bulk action, so this asserts the bar appears
// and that its most consequential action still demands a note — the same
// server rule the single-report path enforces, surfaced once for the whole
// selection instead of per report.
test("selecting rows reveals the bulk bar, and bulk quarantine requires a note", async ({ page }) => {
  await loginAdmin(page);
  await gotoFlagged(page);

  await page.getByRole("checkbox", { name: /^Select report / }).first().check();
  await expect(page.getByText(/1 report selected/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Export selection" })).toBeVisible();

  await page.getByRole("button", { name: "Quarantine", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/hides each report from the public map/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Quarantine 1 report/ })).toBeDisabled();

  await dialog.getByLabel(/Moderation note \(required\)/).fill("Reviewed in E2E");
  await expect(dialog.getByRole("button", { name: /^Quarantine 1 report/ })).toBeEnabled();

  // Deliberately NOT confirmed: this spec runs against the real dev database,
  // and quarantining hides a real report from the public map.
  await page.keyboard.press("Escape");
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

test("mobile viewport renders the stacked list, not the desktop grid", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await loginAdmin(page);
  await gotoFlagged(page);

  await expect(page.getByRole("table")).toBeHidden();
  await expect(page.getByRole("checkbox", { name: /^Select report / }).first()).toBeVisible();
});
