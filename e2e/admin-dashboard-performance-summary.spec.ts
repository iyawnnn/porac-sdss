import { expect, test, type Page } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

function summaryCard(page: Page) {
  return page.getByRole("region", { name: "Office performance summary" });
}

const METRIC_LABELS = [
  "Pending Work Orders",
  "In Progress Work Orders",
  "Overdue Work Orders",
  "Completed This Week",
  "High-Urgency Open Tickets",
  "Flagged Reports Pending",
];

test("dashboard shows the Office Performance Summary section with all six metrics", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const card = summaryCard(page);
  await expect(card).toBeVisible();
  await expect(card.getByText("Office Performance Summary", { exact: true })).toBeVisible();
  for (const label of METRIC_LABELS) await expect(card.getByText(label, { exact: true })).toBeVisible();
});

test("MEO office admin sees an MEO-scoped summary and no cross-office comparison", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const card = summaryCard(page);
  await expect(card.getByText("MEO office summary", { exact: true })).toBeVisible();
  await expect(card.getByText(/MDRRMO office summary|City-wide summary/)).toHaveCount(0);
  await expect(card.getByText("MEO vs. MDRRMO")).toHaveCount(0);
  await expect(card.getByRole("table")).toHaveCount(0);

  const response = await page.evaluate(async () => (await fetch("/api/admin/dashboard")).json());
  expect(response.officePerformanceSummary.scope).toBe("MEO");
  expect(response.officePerformanceSummary.byOffice).toBeNull();
});

test("MDRRMO office admin sees an MDRRMO-scoped summary, never MEO's numbers", async ({ page }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  const card = summaryCard(page);
  await expect(card.getByText("MDRRMO office summary", { exact: true })).toBeVisible();
  await expect(card.getByRole("table")).toHaveCount(0);

  const response = await page.evaluate(async () => (await fetch("/api/admin/dashboard")).json());
  expect(response.officePerformanceSummary.scope).toBe("MDRRMO");
  expect(response.officePerformanceSummary.byOffice).toBeNull();
});

test("system admin sees a city-wide summary plus a MEO vs MDRRMO comparison table", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const card = summaryCard(page);
  await expect(card.getByText("City-wide summary", { exact: true })).toBeVisible();
  await expect(card.getByText("MEO vs. MDRRMO")).toBeVisible();
  const table = card.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: "MEO" })).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: "MDRRMO" })).toBeVisible();

  const response = await page.evaluate(async () => (await fetch("/api/admin/dashboard")).json());
  const summary = response.officePerformanceSummary;
  expect(summary.scope).toBe("ALL");
  expect(summary.byOffice).toBeTruthy();
  // City-wide totals equal the sum of the two offices for every metric —
  // proves the "ALL" scope isn't silently reusing one office's numbers.
  for (const key of ["pendingWorkOrders", "inProgressWorkOrders", "overdueWorkOrders", "completedWorkOrdersThisWeek", "highUrgencyOpenTickets", "flaggedReportsPending"]) {
    expect(summary[key]).toBe(summary.byOffice.MEO[key] + summary.byOffice.MDRRMO[key]);
  }
});

test("no fake sidebar route was added for the performance summary — it stays a dashboard section", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: /performance/i })).toHaveCount(0);
  // The known, real nav set — unchanged by this feature. Reports & Exports,
  // Barangay Insights, and Notifications are separate, real routes (see
  // e2e/admin-reports.spec.ts, e2e/admin-barangay-insights.spec.ts,
  // e2e/admin-notifications.spec.ts), not dashboard-section links, so
  // they're counted here too.
  const expected = ["Dashboard", "Ticket Queue", "Interactive Map", "Barangay Insights", "Work Orders", "Flagged Reports", "Reports & Exports", "Notifications", "Admin Management", "Activity Log"];
  await expect(nav.getByRole("link")).toHaveCount(expected.length);
});
