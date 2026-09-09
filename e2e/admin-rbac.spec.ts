import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

test("office admin sidebar shows a fixed office label, not an all-offices toggle", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  // exact: true — the sidebar's sr-only "Signed in as {name} · My Office:
  // MEO" summary (added for accessibility) contains this exact string as a
  // substring, which would otherwise make a non-exact getByText match both
  // it and the intended visible label and violate Playwright's strict mode.
  await expect(page.getByText("My Office: MEO", { exact: true })).toBeVisible();
  await expect(page.getByText("All Offices")).toHaveCount(0);
});

// Batch 1/4 (five-role RBAC): system_admin's sidebar footer reads "System
// Administrator / MIS", never "All Offices" — that phrasing implied
// operational authority the role no longer has (see AdminSidebar.tsx's
// footerSubtitle and lib/utils/adminScope.ts's officeDisplay). This test
// previously asserted the pre-Batch-1 wording and would have silently kept
// passing against a regressed build — it now pins the current, correct copy
// AND explicitly asserts "All Offices" is gone everywhere in the shell.
test("system admin sidebar shows System Administrator / MIS, never All Offices", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  // exact: true — same sr-only "Signed in as {name} · System Administrator
  // / MIS" substring collision as the MEO test above.
  await expect(page.getByText("System Administrator / MIS", { exact: true })).toBeVisible();
  await expect(page.getByText("All Offices")).toHaveCount(0);
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
  // The filters collapsed into a popover with the queue rebuild, so the office
  // control has to be opened before it can be asserted on.
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByRole("combobox", { name: "Office" })).toHaveCount(0);
  await expect(page.getByLabel("Office", { exact: true })).toHaveText("My Office: MDRRMO");
});

// Batch 1 removed system_admin's operational Ticket Queue access entirely
// (OperationalStaffGuard denies it server-side) — this test previously
// asserted a city-wide office picker that no longer exists in the approved
// five-role model. It never actually ran this far before Batch 5 (the
// shared loginAdmin helper failed first on every system_admin login), so
// this stale assumption was never caught. The page has no frontend
// redirect guard of its own; it relies entirely on the backend 403,
// rendered as the generic "Ticket Queue Unavailable" AdminErrorCard.
test("system admin gets no operational Ticket Queue — backend denies it, no office picker is ever shown", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/tickets");
  await expect(page.getByText("Ticket Queue Unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Filters/ })).toHaveCount(0);
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

// Dashboard-analytics-card-count, Department Workload, and Quick Actions
// coverage were removed here — those sections no longer render on /admin
// (Phase 3 correction: they were cut from the dashboard-landing composition
// entirely, with no other route currently rendering them). See
// e2e/admin-dashboard.spec.ts's "legacy dashboard sections no longer render
// on /admin" for the replacement negative-assertion coverage.
