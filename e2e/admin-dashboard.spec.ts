import { expect, test, type Page } from "@playwright/test";
import { formatDistributionPercent, normalizeDistribution } from "@/components/features/admin/dashboard/DistributionChartUtils";
import { E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as sharedLoginAdmin } from "./helpers";

test.setTimeout(60_000);
async function loginAdmin(page: Page) {
  await sharedLoginAdmin(page, E2E_SYSTEM_ADMIN);
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

test("only the Reports This Month KPI card renders the incident-trend sparkline", async ({ page }) => {
  await loginAdmin(page);
  await expect(cardFor(page, "Reports This Month").locator('[data-slot="chart"]')).toHaveCount(1);
  await expect(cardFor(page, "Active Tickets").locator('[data-slot="chart"]')).toHaveCount(0);
  await expect(cardFor(page, "Pending Work Orders").locator('[data-slot="chart"]')).toHaveCount(0);
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

test("legacy dashboard sections no longer render on /admin", async ({ page }) => {
  await loginAdmin(page);
  await expect(page.getByRole("region", { name: "Quick actions" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Map presets" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Office performance summary" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Dashboard analytics" })).toHaveCount(0);
});

test("range filters, tables, and chart labels remain intact", async ({ page }) => {
  await loginAdmin(page);

  const pending = page.waitForResponse(
    (response) => response.url().includes("/api/admin/dashboard?range=7") && response.status() === 200,
  );
  await page.getByRole("radio", { name: "Last 7 Days" }).click();
  const data = await (await pending).json();
  expectDailyBuckets(data.incidentTrend, 7);

  const dot = page.locator('[data-slot="chart"] .recharts-dot').first();
  await dot.hover({ force: true });
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
