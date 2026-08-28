import { expect, test, type Page } from "@playwright/test";
import { formatDistributionPercent, normalizeDistribution } from "@/components/features/admin/dashboard/DistributionChartUtils";
import { E2E_MDRRMO_ADMIN, E2E_MEO_ADMIN, E2E_SYSTEM_ADMIN, type E2EAdminAccount } from "./test-credentials";
import { loginAdmin as sharedLoginAdmin } from "./helpers";

test.setTimeout(60_000);
async function loginAdmin(page: Page, account: E2EAdminAccount = E2E_SYSTEM_ADMIN) {
  await sharedLoginAdmin(page, account);
}

function cardFor(page: Page, title: string) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(title, { exact: true }) });
}

function expectDailyBuckets(rows: Array<{ date: string; report_count: number }>, days: number) {
  expect(rows).toHaveLength(days);
  for (let index = 1; index < rows.length; index += 1) {
    const current = new Date(rows[index].date + "T00:00:00").getTime();
    const previous = new Date(rows[index - 1].date + "T00:00:00").getTime();
    expect(current - previous).toBe(86_400_000);
  }
}

test("zero totals are safe for chart and two-office workload percentages", () => {
  expect(formatDistributionPercent(0, 0)).toBe("0%");
  const normalized = normalizeDistribution([
    { key: "meo", label: "MEO", count: 0 },
    { key: "mdrrmo", label: "MDRRMO", count: null },
  ]);
  expect(normalized.map((item) => item.count)).toEqual([0, 0]);
});

test("dashboard uses a wide content container", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAdmin(page);

  const dashboardMain = page.locator("main").last();
  const mainBox = await dashboardMain.boundingBox();
  expect(mainBox?.width ?? 0).toBeGreaterThan(1100);
  expect(Math.round(mainBox?.x ?? 0)).toBe(256);

  await expect(page.getByText("Top Urgency Queue", { exact: true })).toHaveCount(0);
});

test("KPI row and Needs Attention rail align at the top and sit side by side at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAdmin(page);

  const kpiRow = page.getByTestId("dashboard-kpi-row");
  const rail = page.getByRole("region", { name: "Needs attention" });

  const [kpiBox, railBox] = await Promise.all([kpiRow.boundingBox(), rail.boundingBox()]);

  expect(Math.round(kpiBox?.y ?? 0)).toBe(Math.round(railBox?.y ?? 0));
  expect(railBox?.x ?? 0).toBeGreaterThan((kpiBox?.x ?? 0) + (kpiBox?.width ?? 0));
});

test("dashboard shows exactly three KPI cards: Active Tickets, Pending Work Orders, Reports This Month", async ({ page }) => {
  await loginAdmin(page);
  const kpiRow = page.getByTestId("dashboard-kpi-row");
  await expect(kpiRow.locator('[data-slot="card"]')).toHaveCount(3);
  await expect(kpiRow.getByText("Active Tickets", { exact: true })).toBeVisible();
  await expect(kpiRow.getByText("Pending Work Orders", { exact: true })).toBeVisible();
  await expect(kpiRow.getByText("Reports This Month", { exact: true })).toBeVisible();
});

// Each KPI card now has its own server-reconstructed history (incidentTrend,
// activeTicketTrend from status_history, pendingWorkOrderTrend from
// work_order_status_history), so all three render a sparkline. This
// previously asserted the opposite — that only Reports This Month had one —
// because the other two metrics had no history available at all.
test("every KPI card renders exactly one sparkline from its own trend series", async ({ page }) => {
  await loginAdmin(page);
  for (const label of ["Reports This Month", "Active Tickets", "Pending Work Orders"]) {
    await expect(cardFor(page, label).locator('[data-slot="chart"]')).toHaveCount(1);
  }
});

// Guards the honesty rule these sparklines exist under: each series is a
// real point-in-time history whose final value must equal the headline count
// on the same card. A sparkline synthesized from the KPI number, or one
// scoped to a different office, would drift here.
test("each KPI sparkline series ends at the card's own headline count", async ({ page }) => {
  await loginAdmin(page);
  const response = await page.request.get("/api/admin/dashboard?range=7");
  expect(response.ok()).toBe(true);
  const data = await response.json();

  expect(data.activeTicketTrend).toHaveLength(7);
  expect(data.pendingWorkOrderTrend).toHaveLength(7);
  expectDailyBuckets(
    data.activeTicketTrend.map((row: { date: string; count: number }) => ({
      date: row.date,
      report_count: row.count,
    })),
    7,
  );

  const lastActive = data.activeTicketTrend.at(-1).count;
  expect(lastActive).toBe(data.kpis.active_count);

  const lastPending = data.pendingWorkOrderTrend.at(-1).count;
  expect(lastPending).toBe(data.officePerformanceSummary.pendingWorkOrders);
});

test("Highest Urgency Actions renders at most 5 rows and its View all link uses the verified Ticket Queue ordering", async ({ page }) => {
  await loginAdmin(page);
  const card = page.getByTestId("highest-urgency-actions");
  const rowCount = await card.locator("table tbody tr").count();
  expect(rowCount).toBeGreaterThan(0);
  expect(rowCount).toBeLessThanOrEqual(5);

  const viewAll = page.getByRole("link", { name: "View all" });
  await expect(viewAll).toHaveAttribute("href", /\/admin\/tickets\?sort=priority_desc&status=active/);
});

test("restored dashboard sections render from the existing dashboard response", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await loginAdmin(page);
  await expect(page.getByRole("region", { name: "Quick actions" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Office performance summary" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Dashboard analytics" })).toBeVisible();
  await expect(page.getByText("Category Distribution", { exact: true })).toBeVisible();
  await expect(page.getByText("Ticket Status Distribution", { exact: true })).toBeVisible();
  await expect(page.getByText("Reports by Citizen Severity", { exact: true })).toBeVisible();
  await expect(page.getByText("Department Workload", { exact: true })).toBeVisible();
  await expect(page.getByText("MEO vs. MDRRMO", { exact: true })).toBeVisible();

  const mapPresets = page.getByRole("region", { name: "Map presets" });
  await expect(mapPresets).toBeVisible();
  await expect(mapPresets.getByRole("link", { name: "Drainage Issues" })).toHaveAttribute(
    "href",
    "/admin/map?category=Drainage+%2F+Culvert+%2F+Manhole+Issue&office=MEO",
  );
  await expect(mapPresets.getByRole("link", { name: "Flooding Reports" })).toHaveAttribute(
    "href",
    "/admin/map?category=Localized+Flooding&office=MDRRMO",
  );
  await mapPresets.getByRole("link", { name: "Drainage Issues" }).click();
  await expect(page).toHaveURL(/\/admin\/map\?category=Drainage\+%2F\+Culvert\+%2F\+Manhole\+Issue&office=MEO$/);
  await page.getByRole("button", { name: "Filters 1", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Category" })).toContainText("Drainage / Culvert / Manhole Issue");

  for (const account of [E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN]) {
    await page.context().clearCookies();
    await loginAdmin(page, account);

    await expect(page.getByText(`${account.office} office summary`, { exact: true })).toBeVisible();
    await expect(page.getByText("MEO vs. MDRRMO", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Department Workload", { exact: true })).toHaveCount(0);

    const scopedMapPresets = page.getByRole("region", { name: "Map presets" });
    const presetName = account.office === "MEO" ? "Drainage Issues" : "Flooding Reports";
    const presetCategory = account.office === "MEO" ? "Drainage+%2F+Culvert+%2F+Manhole+Issue" : "Localized+Flooding";
    await expect(scopedMapPresets.getByRole("link", { name: presetName })).toHaveAttribute(
      "href",
      `/admin/map?category=${presetCategory}`,
    );
  }

  expect(consoleErrors).toEqual([]);
});

test("range filters, tables, and chart labels remain intact", async ({ page }) => {
  await loginAdmin(page);

  const pending = page.waitForResponse(
    (response) => response.url().includes("/api/admin/dashboard?range=7") && response.status() === 200,
  );
  // The range control is a Select, not the segmented ToggleGroup it used to
  // be, so the interaction is open-then-choose (combobox -> option) rather
  // than a single click on a radio.
  await page.getByRole("combobox", { name: "Incident report date range" }).click();
  await page.getByRole("option", { name: "Last 7 days" }).click();
  const data = await (await pending).json();
  expectDailyBuckets(data.incidentTrend, 7);

  // The incident trend renders as a bar chart, so the hover target is a bar
  // rectangle — there is no .recharts-dot to grab (dots are an area/line
  // affordance). The KPI sparkline is still an AreaChart, hence scoping to
  // the trend card rather than the first [data-slot="chart"] on the page.
  const bar = page.getByTestId("incident-trend-chart").locator(".recharts-bar-rectangle").first();
  await bar.hover({ force: true });
  await expect(page.getByTestId("incident-chart-tooltip")).toBeVisible();

  expect(data.leaderboard.length).toBeLessThanOrEqual(5);
  expect(data.categories.length).toBeLessThanOrEqual(5);
});

for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["desktop compact", 1280, 1000],
  ["tablet", 1024, 1000],
  ["small tablet", 768, 1000],
  ["mobile", 390, 1100],
] as const) {
  test("dashboard remains overflow-free and responsive at " + name, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await loginAdmin(page);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
}
