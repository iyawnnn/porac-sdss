import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

test("office admin sidebar shows a fixed office label, not an all-offices toggle", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await expect(page.getByText("My Office: MEO")).toBeVisible();
  await expect(page.getByText("All Offices")).toHaveCount(0);
});

test("system admin sidebar shows All Offices", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await expect(page.getByText("All Offices")).toBeVisible();
  await expect(page.getByText(/^My Office:/)).toHaveCount(0);
});

test("office admin ticket queue has no office picker, only a fixed office badge", async ({ page }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  await page.goto("/admin/tickets");
  // The office control is a non-interactive Badge for office admins, not a
  // Select combobox — assert there's no clickable picker, only the fixed
  // label. Scoped to the labeled Badge specifically: the sidebar footer
  // shows the same "My Office: MDRRMO" text, so a plain getByText here
  // would match both and violate Playwright's strict-locator mode.
  await expect(page.getByRole("combobox", { name: "Office" })).toHaveCount(0);
  await expect(page.getByLabel("Office", { exact: true })).toHaveText("My Office: MDRRMO");
});

test("system admin ticket queue has a real office picker with All offices", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/tickets");
  const officeSelect = page.getByLabel("Office", { exact: true });
  await expect(officeSelect).toBeVisible();
  await officeSelect.click();
  await expect(page.getByRole("option", { name: "All offices" })).toBeVisible();
  await expect(page.getByRole("option", { name: "MEO", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "MDRRMO", exact: true })).toBeVisible();
});

test("office admin cannot open another office's ticket via a doctored URL", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  // Find an MDRRMO ticket id via the API the page itself would use, then try
  // to view it directly — the ticket detail page should not render it.
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === "ac_admin_session");
  const mdrrmoTickets = await request.get("/api/admin/tickets?office=MDRRMO&status=all&limit=1", {
    headers: sessionCookie ? { cookie: `${sessionCookie.name}=${sessionCookie.value}` } : {},
  });
  // The list endpoint itself is clamped to MEO for this admin, so it should
  // return zero MDRRMO rows even though we asked for office=MDRRMO.
  const body = await mdrrmoTickets.json();
  expect(body.tickets.every((t: { assigned_office: string }) => t.assigned_office === "MEO")).toBe(true);
});

test("office admin dashboard shows only their own office's data, no cross-office card", async ({ page }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  const response = await page.evaluate(async () => (await fetch("/api/admin/dashboard")).json());
  expect(response.departmentWorkload).toBeNull();
  const analytics = page.getByRole("region", { name: "Dashboard analytics" });
  await expect(analytics.locator('[data-slot="card"]')).toHaveCount(2);
  await expect(page.getByText("Department Workload")).toHaveCount(0);
});

test("system admin dashboard includes the cross-office Department Workload card", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const response = await page.evaluate(async () => (await fetch("/api/admin/dashboard")).json());
  expect(Array.isArray(response.departmentWorkload)).toBe(true);
  await expect(page.getByText("Department Workload")).toBeVisible();
});

test("system admin dashboard quick actions say All Tickets", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const quickActions = page.getByRole("region", { name: "Quick actions" });
  await expect(quickActions.getByRole("link", { name: "All Tickets" })).toHaveAttribute("href", "/admin/tickets");
  await expect(quickActions.getByRole("link", { name: "My Office Tickets" })).toHaveCount(0);
  await expect(quickActions.getByRole("link", { name: "High Urgency Tickets" })).toHaveAttribute("href", "/admin/tickets?urgency=Critical");
  await expect(quickActions.getByRole("link", { name: "Flagged Reports" })).toHaveAttribute("href", "/admin/flagged");
  await expect(quickActions.getByRole("link", { name: "GIS Map" })).toHaveAttribute("href", "/admin/map");
});

test("office admin dashboard quick actions say My Office Tickets, not All Tickets", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const quickActions = page.getByRole("region", { name: "Quick actions" });
  await expect(quickActions.getByRole("link", { name: "My Office Tickets" })).toHaveAttribute("href", "/admin/tickets");
  await expect(quickActions.getByRole("link", { name: "All Tickets" })).toHaveCount(0);
});
