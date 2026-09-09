import { expect, test } from "@playwright/test";
import { E2E_FOCAL_ADMIN, E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

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

test("Focal cannot reach the operational Ticket Queue, Work Orders, or Admin Management", async ({ page }) => {
  await loginAs(page, E2E_FOCAL_ADMIN);

  await page.goto("/admin/tickets");
  await expect(page.getByText("Ticket Queue Unavailable")).toBeVisible();

  await page.goto("/admin/work-orders");
  await expect(page.getByText(/unavailable/i)).toBeVisible();

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
  await expect(page.getByText("Intake Queue Unavailable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Intake Queue" })).toHaveCount(0);

  await page.goto("/admin/focal/map");
  await expect(page.getByText("Interactive Map Unavailable")).toBeVisible();
});

test("MEO/MDRRMO operational staff cannot reach Focal Intake", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/focal/intake");
  await expect(page.getByText("Intake Queue Unavailable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Intake Queue" })).toHaveCount(0);
});

test("acknowledging a report does not change the ticket's Reported status", async ({ page, request }) => {
  await loginAs(page, E2E_FOCAL_ADMIN);
  const cookies = await page.context().cookies();
  const cookieHeader = sessionCookieHeader(cookies);

  const intakeRes = await request.get("/api/admin/intake", { headers: cookieHeader });
  const rows: { reportId: number; ticketStatus: string; intakeState: string }[] = await intakeRes.json();
  const target = rows.find((r) => r.ticketStatus === "Reported" && r.intakeState === "New");
  test.skip(!target, "No unacknowledged Reported-status report available in this environment's seed data.");

  const ackRes = await request.post(`/api/admin/intake/${target!.reportId}/acknowledge`, {
    headers: cookieHeader,
    data: {},
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
  const admins: { role: string; email: string }[] = await res.json();
  expect(admins.every((a) => a.role === "officer" || a.role === "supervisor")).toBe(true);
  expect(admins.some((a) => a.email === E2E_FOCAL_ADMIN.email)).toBe(false);
});

test("MEO/MDRRMO Ticket Queue defaults to Operational Priority descending", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets");
  await expect(page.getByText(/sorted by operational priority, highest first/i)).toBeVisible();
});
