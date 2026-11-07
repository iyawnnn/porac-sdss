import { expect, test } from "@playwright/test";
import { E2E_FOCAL_ADMIN, E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";
import { expectCitizenNoticeForAccount } from "./citizen-notification-checks";
import type { FocalDashboardCounts, FocalDashboardReports } from "../lib/types/admin-focal-dashboard";
import { metricDuration } from "../lib/utils/metric-duration";

test.setTimeout(60_000);

// Same pattern as the sessionCookieHeader helper in sibling specs (e.g.
// admin-notifications.spec.ts) — the explicit Record<string, string> return
// type is required so the `{}` branch widens correctly; an untyped inline
// ternary infers `{ cookie: string } | {}`, which doesn't satisfy
// Playwright's `headers?: Record<string, string>` param.
function sessionCookieHeader(cookies: { name: string; value: string }[]): Record<string, string> {
  const cookie = cookies.find((c) => c.name === "ac_admin_session");
  return cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {};
}

// Batch 5 (five-role final integration): the highest-value automated
// coverage for the production Focal Intake surface — real HTTP pipeline,
// real Postgres, real FocalGuard/OperationalStaffGuard enforcement. See
// docs/testing.md for the shared demo-data/credential conventions.

test("Focal Dashboard and Intake Queue load, and Intake spans both offices", async ({ page }) => {
  await loginAs(page, E2E_FOCAL_ADMIN);
  await expect(page.getByText("Focal Dashboard")).toBeVisible();

  await page.goto("/admin/focal/intake");
  await expect(page.getByRole("heading", { name: "Intake Queue" })).toBeVisible();
  // Municipality-wide: both offices' routed reports must appear in the same
  // table, never filtered to one office by default (see
  // FocalIntakeService.listIntake's own docblock — deliberately no office
  // filter/param).
  await expect(page.getByText("MEO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("MDRRMO", { exact: true }).first()).toBeVisible();
});

test("Focal dashboard uses server counts and paged municipality-wide intake summaries", async ({ page }) => {
  await loginAs(page, E2E_FOCAL_ADMIN);
  const headers = sessionCookieHeader(await page.context().cookies());
  const countResponse = await page.request.get("/api/admin/focal-dashboard", { headers });
  expect(countResponse.ok()).toBe(true);
  const counts: FocalDashboardCounts = await countResponse.json();
  expect(Object.keys(counts).sort()).toEqual(["newReports", "unacknowledged", "needsScreening", "forwardedOrEscalated", "medianAcknowledgmentHours30d"].sort());
  const response = await page.request.get("/api/admin/focal-dashboard/reports?page=1&pageSize=2", { headers });
  expect(response.ok()).toBe(true);
  const first: FocalDashboardReports = await response.json();
  expect(first.total).toBe(counts.newReports);
  expect(first.items.length).toBeLessThanOrEqual(2);
  expect(first).toMatchObject({ page: 1, pageSize: 2 });
  const secondResponse = await page.request.get("/api/admin/focal-dashboard/reports?page=2&pageSize=2", { headers });
  expect(secondResponse.ok()).toBe(true);
  const second: FocalDashboardReports = await secondResponse.json();
  expect(second.total).toBe(first.total);
  expect(second.items.every(row => !first.items.some(other => other.reportId === row.reportId))).toBe(true);
  await page.goto("/admin/focal?pageSize=2");
  await expect(page.getByText(`Median time to acknowledge (last 30 days): ${metricDuration(counts.medianAcknowledgmentHours30d)}`)).toBeVisible();
  await expect(page.getByTestId("focal-kpi-row")).toContainText(counts.newReports.toLocaleString());
  const pages = page.getByRole("navigation", { name: "Incoming reports pages" });
  await expect(pages).toContainText(`${first.total.toLocaleString()} reports`);
  if (first.total > 2) {
    await pages.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/page=2&pageSize=2/);
    await expect(pages).toContainText("Page 2");
    await expect(pages.getByRole("link", { name: "Previous", exact: true })).toBeVisible();
  }
  expect((await page.request.get("/api/admin/focal-dashboard/reports?pageSize=51", { headers })).status()).toBe(400);
  // Existing operational guard boundaries stay enforced.
  expect((await page.request.get("/api/admin/work-orders", { headers })).status()).toBe(403);
});

// Manuscript revision Phase 1, step 6b: Focal screens show Operational
// Priority, not Hazard Urgency, and the Hazard Urgency filter is gone.
test("Focal Dashboard and Intake Queue show Operational Priority and no Hazard Urgency", async ({ page }) => {
  await loginAs(page, E2E_FOCAL_ADMIN);
  await expect(page.getByText("Focal Dashboard")).toBeVisible();
  await expect(page.getByText(/Hazard Urgency/)).toHaveCount(0);

  await page.goto("/admin/focal/intake");
  await expect(page.getByRole("heading", { name: "Intake Queue" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Op. Priority" })).toBeVisible();
  await expect(page.getByText(/Hazard Urgency/)).toHaveCount(0);
  await expect(page.getByLabel("Filter by Hazard Urgency")).toHaveCount(0);
});

test("Focal intake detail shows the Operational Priority card and no Hazard Urgency", async ({ page }) => {
  await loginAs(page, E2E_FOCAL_ADMIN);
  await page.goto("/admin/focal/intake");
  await expect(page.getByRole("heading", { name: "Intake Queue" })).toBeVisible();
  const firstReview = page.getByRole("link", { name: "Review", exact: true }).first();
  test.skip((await firstReview.count()) === 0, "No intake rows in this environment's data.");
  await firstReview.click();

  await expect(page).toHaveURL(/\/admin\/focal\/intake\/\d+$/);
  await expect(page.getByText("Decision Support", { exact: true })).toBeVisible();
  await expect(page.getByText("Operational Priority", { exact: true })).toBeVisible();
  await expect(page.getByText(/Hazard Urgency/)).toHaveCount(0);
});

// Manuscript revision Phase 3, step 3a: Focal intake notifications created
// before the step link to /admin/intake/{id} (the API path, no page);
// next.config.ts redirects numeric ids to the intake detail page. Uses an
// existing intake row, so it creates no report.
test("an old Focal notification link /admin/intake/{id} lands on the intake detail page", async ({ page, request, browser }) => {
  await loginAs(page, E2E_FOCAL_ADMIN);
  const intakeRes = await request.get("/api/admin/intake", { headers: sessionCookieHeader(await page.context().cookies()) });
  expect(intakeRes.ok()).toBe(true);
  const rows: { reportId: number }[] = await intakeRes.json();
  test.skip(rows.length === 0, "No intake rows in this environment's data.");
  const { reportId } = rows[0];

  const response = await page.goto(`/admin/intake/${reportId}`);
  await expect(page).toHaveURL(new RegExp(`/admin/focal/intake/${reportId}$`));
  expect(response?.request().redirectedFrom()?.url()).toMatch(new RegExp(`/admin/intake/${reportId}$`));
  expect(response?.status()).toBe(200);
  await expect(page.getByText("Decision Support", { exact: true })).toBeVisible();

  // Only numeric ids are redirected.
  const other = await page.goto("/admin/intake/not-a-report");
  expect(other?.status()).toBe(404);
  await expect(page).toHaveURL(/\/admin\/intake\/not-a-report$/);

  // Access rules still apply on the target: signed out ends at the login page.
  const signedOut = await browser.newContext();
  const signedOutPage = await signedOut.newPage();
  await signedOutPage.goto(`/admin/intake/${reportId}`);
  await expect(signedOutPage).toHaveURL(/\/admin\/login$/);
  await signedOut.close();
});

test("Focal cannot reach the operational Ticket Queue, Work Orders, or Admin Management", async ({ page }) => {
  await loginAs(page, E2E_FOCAL_ADMIN);

  await page.goto("/admin/tickets");
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();

  await page.goto("/admin/work-orders");
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();

  // SystemAdminGuard rejects non-system_admin with 403, treated the same as
  // a missing page (Next's own not-found render) rather than an error card
  // (see app/admin/admins/page.tsx) — "This page could not be found." is
  // Next's default 404 copy, not custom text this app owns.
  await page.goto("/admin/admins");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

test("MIS (system_admin) cannot reach Focal Intake or the Focal Map", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);

  await page.goto("/admin/focal/intake");
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Intake Queue" })).toHaveCount(0);

  await page.goto("/admin/focal/map");
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
});

test("MEO/MDRRMO operational staff cannot reach Focal Intake", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/focal/intake");
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Intake Queue" })).toHaveCount(0);
});

test("acknowledging a report does not change the ticket's Reported status", async ({ page, request, browser }) => {
  await loginAs(page, E2E_FOCAL_ADMIN);
  const cookies = await page.context().cookies();
  const cookieHeader = sessionCookieHeader(cookies);

  const target = process.env.E2E_GROUPING_FIXTURES
    ? (JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { routing: { focalWorkOrder: { reportId: number } } }).routing.focalWorkOrder
    : null;
  test.skip(!target, "Needs the test-owned Reported routing fixture.");

  const ackRes = await request.post(`/api/admin/intake/${target!.reportId}/acknowledge`, {
    headers: cookieHeader,
    data: { remarks: "E2E acknowledgment staff-only remarks" },
  });
  expect(ackRes.ok()).toBe(true);
  const detail = await ackRes.json();

  // The critical acceptance case: ACKNOWLEDGED != UNDER REVIEW.
  expect(detail.ticketStatus).toBe("Reported");
  expect(detail.intakeState).toBe("Acknowledged");

  const second = await request.post(`/api/admin/intake/${target!.reportId}/acknowledge`, {
    headers: cookieHeader,
    data: {},
  });
  expect(second.status()).toBe(409);
  await expectCitizenNoticeForAccount(browser, { reportId: target!.reportId, type: "ticket_acknowledged", message: "Your report has been acknowledged by municipal monitoring.", forbidden: ["E2E acknowledgment staff-only remarks", `${E2E_FOCAL_ADMIN.firstName} ${E2E_FOCAL_ADMIN.lastName}`] });
});

test("Work Order assignee directory excludes Focal even when querying MDRRMO (focal's own office column)", async ({ page, request }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === "ac_admin_session");
  // Focal's admins.office column is literally 'MDRRMO' (organizational, not
  // operational) — querying this exact office is the meaningful case,
  // since a naive office-only filter would incorrectly surface Focal here.
  const res = await request.get("/api/admin/admins/directory?office=MDRRMO", {
    headers: sessionCookie ? { cookie: `${sessionCookie.name}=${sessionCookie.value}` } : {},
  });
  expect(res.ok()).toBe(true);
  const admins: { account_type: string; is_focal: boolean; email: string }[] = await res.json();
  expect(admins.every((a) => a.account_type === "PERSONNEL" && a.is_focal === false)).toBe(true);
  expect(admins.some((a) => a.email === E2E_FOCAL_ADMIN.email)).toBe(false);
});

test("MEO/MDRRMO Ticket Queue defaults to Operational Priority descending", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets");
  await expect(page.getByText(/sorted by operational priority, highest first/i)).toBeVisible();
});
