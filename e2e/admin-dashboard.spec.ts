import { expect, test, type Page } from "@playwright/test";
import { formatDistributionPercent, normalizeDistribution } from "@/components/features/admin/dashboard/DistributionChartUtils";
import { E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as sharedLoginAdmin } from "./helpers";

test.setTimeout(60_000);
// This spec exercises the full city-wide dashboard — including the
// cross-office Department Workload card — which is System Administrator
// only since the RBAC/office-scoping hardening (see
// api/src/admin/dashboard.controller.ts: departmentWorkload is null for
// office-scoped MEO/MDRRMO admins). MEO/MDRRMO-scoped dashboard behavior
// (2 analytics cards, no department workload) is covered by
// e2e/admin-rbac.spec.ts instead.
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

test("dashboard uses a wide content container and exactly three analytics cards", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAdmin(page);

  const dashboardMain = page.locator("main").last();
  const mainBox = await dashboardMain.boundingBox();
  expect(mainBox?.width ?? 0).toBeGreaterThan(1100);
  expect(Math.round(mainBox?.x ?? 0)).toBe(256);

  await expect(page.getByText("Top Urgency Queue", { exact: true })).toHaveCount(0);

  const analytics = page.getByRole("region", { name: "Dashboard analytics" });
  await expect(analytics.locator('[data-slot="card"]')).toHaveCount(3);
  await expect(analytics.locator('[data-chart-kind="donut"]')).toHaveCount(2);
  await expect(analytics.locator('[data-chart-kind="radial-bar"]')).toHaveCount(1);
});

test("hero cards align at the top without forcing chart-card whitespace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAdmin(page);

  const hero = page
    .getByText("Incident Reports Over Time", { exact: false })
    .first()
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  const active = cardFor(page, "active tickets");

  const [heroBox, activeBox, chartBox] = await Promise.all([
    hero.boundingBox(),
    active.boundingBox(),
    hero.locator('[data-slot="chart"]').boundingBox(),
  ]);

  expect(Math.round(heroBox?.y ?? 0)).toBe(Math.round(activeBox?.y ?? 0));
  expect(heroBox?.height ?? 0).toBeLessThan(activeBox?.height ?? 0);
  expect((heroBox?.height ?? 0) - (chartBox?.height ?? 0)).toBeLessThan(150);
});

test("active-ticket legend has swatches matching its rendered lifecycle arcs", async ({ page }) => {
  await loginAdmin(page);

  const chart = page.locator('[data-slot="chart"][aria-label="Active ticket lifecycle distribution"]');
  const arcFills = await chart
    .locator(".recharts-pie-sector path")
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fill));
  expect(arcFills.length).toBeGreaterThan(0);

  for (const key of ["reported", "under-review", "in-progress"]) {
    const swatch = page.getByTestId("legend-swatch-" + key).first();
    await expect(swatch).toBeVisible();
    const fill = await swatch.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(arcFills).toContain(fill);
  }

  const srOnlyPosition = await cardFor(page, "active tickets")
    .locator(".sr-only")
    .first()
    .evaluate((element) => getComputedStyle(element).position);
  expect(srOnlyPosition).toBe("absolute");
});

test("department workload renders a single MEO/MDRRMO donut with real safe shares", async ({ page }) => {
  await loginAdmin(page);

  const response = await page.evaluate(async () => (await fetch("/api/admin/dashboard?range=30")).json());
  const workload = new Map<string, number>(
    response.departmentWorkload.map(
      (row: { label: string; count: number }) => [row.label, Number(row.count)] as [string, number],
    ),
  );
  const total = (workload.get("MEO") ?? 0) + (workload.get("MDRRMO") ?? 0);

  const card = cardFor(page, "Department Workload");
  const chart = card.locator('[data-slot="chart"][aria-label="Department workload"]');
  await expect(card.locator('[data-chart-kind="donut"]')).toHaveCount(1);
  await expect(chart).toBeVisible();

  for (const [key, label] of [["meo", "MEO"], ["mdrrmo", "MDRRMO"]] as const) {
    const legend = card.getByRole("list", { name: "Department workload legend" });
    await expect(legend.getByText(label, { exact: true })).toBeVisible();
    await expect(card.getByTestId("legend-swatch-" + key)).toBeVisible();
    const share = formatDistributionPercent(workload.get(label) ?? 0, total);
    await expect(legend.getByText(share, { exact: true })).toBeVisible();
  }

  for (const prohibited of ["BFP", "PNP", "RHU", "capacity", "personnel", "response unit"]) {
    await expect(card.getByText(new RegExp(prohibited, "i"))).toHaveCount(0);
  }
  expect(await card.innerText()).not.toMatch(/NaN|Infinity/);
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

for (const [name, width, height, expectedColumns] of [
  ["desktop", 1440, 1000, 3],
  ["desktop compact", 1280, 1000, 3],
  ["tablet", 1024, 1000, 2],
  ["small tablet", 768, 1000, 1],
  ["mobile", 390, 1100, 1],
] as const) {
  test("dashboard remains overflow-free and responsive at " + name, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await loginAdmin(page);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);

    const boxes = await Promise.all(
      ["Ticket Status Distribution", "Reports by Citizen Severity", "Department Workload"].map(
        async (title) => cardFor(page, title).boundingBox(),
      ),
    );
    const alignedWithFirst = boxes.filter((box) => Math.abs((box?.y ?? 0) - (boxes[0]?.y ?? 0)) < 2);
    expect(alignedWithFirst).toHaveLength(expectedColumns);
  });
}
