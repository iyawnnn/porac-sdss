import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

function sessionCookieHeader(cookies: { name: string; value: string }[]): Record<string, string> {
  const cookie = cookies.find((c) => c.name === "ac_admin_session");
  return cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {};
}

// Same "borrow a ticket, restore in afterAll" pattern as
// e2e/admin-work-orders.spec.ts's borrowTicketForOffice — demo seed data
// (seed-diverse-reports.ts) doesn't guarantee an MDRRMO ticket exists, so
// this reassigns one via the already-covered reassign endpoint rather than
// depending on seed content this spec doesn't own.
//
// Batch 5 (five-role final integration): this used to look up/reassign
// tickets via system_admin, which had city-wide operational access before
// Batch 1. Batch 1 removed that entirely (OperationalStaffGuard denies
// system_admin on every ticket route now — see admin-scope.ts), so the
// original helper crashed here (a 403 body has no `.tickets`) on every run
// once the integration database actually had Batch 1's guard in front of
// it. The fix keeps the exact same "borrow, restore in afterAll" shape but
// authenticates as the OWNING office's own admin at each step instead —
// which is also just a more faithful test of the real permission model
// (an office admin reassigning within their own authority), not a
// workaround.
const OFFICE_ADMIN = { MEO: E2E_MEO_ADMIN, MDRRMO: E2E_MDRRMO_ADMIN } as const;
let borrowedTicket: { id: number; originalOffice: "MEO" | "MDRRMO" } | null = null;

async function ticketIdAsSystemAdmin(browser: Browser, office: "MEO" | "MDRRMO"): Promise<number> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, OFFICE_ADMIN[office]);
  const cookies = await context.cookies();
  const headers = { ...sessionCookieHeader(cookies), "content-type": "application/json" };

  const res = await context.request.get(`/api/admin/tickets?status=all&limit=1`, { headers });
  const body = await res.json();
  if (body.tickets.length > 0) {
    await context.close();
    return body.tickets[0].id as number;
  }
  await context.close();

  // This office has no ticket of its own yet — borrow one from the other
  // office, authenticated as THAT office's admin (the only session with
  // authority to reassign a ticket it currently owns).
  const otherOffice = office === "MEO" ? "MDRRMO" : "MEO";
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await loginAs(otherPage, OFFICE_ADMIN[otherOffice]);
  const otherCookies = await otherContext.cookies();
  const otherHeaders = { ...sessionCookieHeader(otherCookies), "content-type": "application/json" };
  const anyTicket = await otherContext.request.get(`/api/admin/tickets?status=all&limit=1`, { headers: otherHeaders });
  const anyBody = await anyTicket.json();
  expect(anyBody.tickets.length).toBeGreaterThan(0);
  const ticket = anyBody.tickets[0] as { id: number; assigned_office: "MEO" | "MDRRMO" };
  const reassign = await otherContext.request.post(`/api/admin/tickets/${ticket.id}/reassign`, { headers: otherHeaders, data: { toOffice: office } });
  expect(reassign.ok()).toBe(true);
  borrowedTicket = { id: ticket.id, originalOffice: ticket.assigned_office };
  await otherContext.close();
  return ticket.id;
}

test.afterAll(async ({ browser }) => {
  if (!borrowedTicket) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  // Restore via the office that currently holds it — it was moved TO
  // borrowedTicket.originalOffice's counterpart, so the admin who can move
  // it back is whichever office it's sitting in right now.
  const currentOffice = borrowedTicket.originalOffice === "MEO" ? "MDRRMO" : "MEO";
  await loginAs(page, OFFICE_ADMIN[currentOffice]);
  const cookies = await context.cookies();
  const headers = { ...sessionCookieHeader(cookies), "content-type": "application/json" };
  await context.request.post(`/api/admin/tickets/${borrowedTicket.id}/reassign`, {
    headers,
    data: { toOffice: borrowedTicket.originalOffice },
  });
  await context.close();
});

// Creates an office-wide "New work order" notification (work_order_created,
// no assignedAdminId — see WorkOrdersService.create) for the given office,
// via the real API rather than seeding the notifications table directly, so
// this exercises the actual write path a Notification Center row would
// come from. Runs as the office's own admin so the work order's assigned
// office matches the ticket's office (server-enforced).
async function createOfficeNotification(page: Page, ticketId: number): Promise<string> {
  const cookies = await page.context().cookies();
  const title = `E2E notification check ${Date.now()}`;
  const res = await page.request.post("/api/admin/work-orders", {
    headers: sessionCookieHeader(cookies),
    data: { ticketId, title },
  });
  expect(res.ok()).toBe(true);
  return title;
}

// --- Sidebar / route -------------------------------------------------------

test("Notifications sidebar link exists and navigates to a real route", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const nav = page.getByRole("navigation", { name: "Admin" });
  const link = nav.getByRole("link", { name: "Notifications", exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/admin\/notifications$/);
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
});

test("no citizen route can access the Notification Center", async ({ page }) => {
  // Same proxy.ts page-redirect convention as every other admin page route
  // (see e2e/admin-reports.spec.ts, e2e/admin-barangay-insights.spec.ts).
  const res = await page.request.get("/admin/notifications");
  expect(res.ok()).toBe(true);
  expect(res.url()).toContain("/admin/login");
});

// --- Page loads, scoping -----------------------------------------------------

test("/admin/notifications page loads for an authenticated admin", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Status" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Type" })).toBeVisible();
});

test("MEO admin sees an MEO office-wide notification, MDRRMO admin never sees it", async ({ page, browser }) => {
  const meoTicketId = await ticketIdAsSystemAdmin(browser, "MEO");
  await loginAs(page, E2E_MEO_ADMIN);
  const title = await createOfficeNotification(page, meoTicketId);

  await page.goto("/admin/notifications");
  await expect(page.getByText(title)).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, E2E_MDRRMO_ADMIN);
  await page.goto("/admin/notifications");
  await expect(page.getByText(title)).toHaveCount(0);
});

test("MDRRMO admin sees an MDRRMO office-wide notification, MEO admin never sees it", async ({ page, browser }) => {
  const mdrrmoTicketId = await ticketIdAsSystemAdmin(browser, "MDRRMO");
  await loginAs(page, E2E_MDRRMO_ADMIN);
  const title = await createOfficeNotification(page, mdrrmoTicketId);

  await page.goto("/admin/notifications");
  await expect(page.getByText(title)).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/notifications");
  await expect(page.getByText(title)).toHaveCount(0);
});

// Batch 4 (five-role production alignment) deliberately removed this: MIS/
// system_admin no longer inherits ANY office-wide operational notification
// (office === null used to be treated as "show every office" — see
// NotificationsService.scopeFilter's role-aware rewrite). This test
// previously asserted the pre-Batch-4 bug as correct behavior and would
// have silently kept passing against a regression — it now pins the fixed
// behavior.
test("system admin does NOT receive office-wide notifications from either office", async ({ page, browser }) => {
  const meoTicketId = await ticketIdAsSystemAdmin(browser, "MEO");
  const mdrrmoTicketId = await ticketIdAsSystemAdmin(browser, "MDRRMO");

  await loginAs(page, E2E_MEO_ADMIN);
  const meoTitle = await createOfficeNotification(page, meoTicketId);
  await page.context().clearCookies();
  await loginAs(page, E2E_MDRRMO_ADMIN);
  const mdrrmoTitle = await createOfficeNotification(page, mdrrmoTicketId);
  await page.context().clearCookies();

  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/notifications");
  await expect(page.getByText(meoTitle)).toHaveCount(0);
  await expect(page.getByText(mdrrmoTitle)).toHaveCount(0);
});

// --- Unread/read state, mark read, mark all read -----------------------------

test("unread notifications show an Unread badge and a Mark as read action; marking removes both", async ({ page, browser }) => {
  const ticketId = await ticketIdAsSystemAdmin(browser, "MEO");
  await loginAs(page, E2E_MEO_ADMIN);
  const title = await createOfficeNotification(page, ticketId);

  await page.goto("/admin/notifications");
  const row = page.getByText(title).locator("xpath=ancestor::li[1]");
  await expect(row.getByText("Unread", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Mark as read" }).click();
  await expect(row.getByText("Unread", { exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Mark as read" })).toHaveCount(0);
});

test("the Unread filter hides read notifications and the Read filter hides unread ones", async ({ page, browser }) => {
  const ticketId = await ticketIdAsSystemAdmin(browser, "MEO");
  await loginAs(page, E2E_MEO_ADMIN);
  const title = await createOfficeNotification(page, ticketId);
  await page.goto("/admin/notifications");

  const statusFilter = page.getByRole("combobox", { name: "Status", exact: true });
  await statusFilter.click();
  await page.getByRole("option", { name: "Unread", exact: true }).click();
  await expect(page.getByText(title)).toBeVisible();

  await statusFilter.click();
  await page.getByRole("option", { name: "Read", exact: true }).click();
  await expect(page.getByText(title)).toHaveCount(0);
});

test("Mark all read clears every unread badge on the page", async ({ page, browser }) => {
  const ticketId = await ticketIdAsSystemAdmin(browser, "MEO");
  await loginAs(page, E2E_MEO_ADMIN);
  await createOfficeNotification(page, ticketId);
  await page.goto("/admin/notifications");

  await expect(page.getByText("Unread", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByText("Unread", { exact: true })).toHaveCount(0);
});

// --- Bell integration ---------------------------------------------------------

test("the bell has a View all notifications link to the Notification Center", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.getByRole("button", { name: /notifications/i }).click();
  const link = page.getByRole("menuitem", { name: "View all notifications" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/admin\/notifications$/);
});

test("marking a notification read in the Notification Center updates the bell's unread badge", async ({ page, browser }) => {
  const ticketId = await ticketIdAsSystemAdmin(browser, "MEO");
  await loginAs(page, E2E_MEO_ADMIN);
  await createOfficeNotification(page, ticketId);
  await page.goto("/admin/notifications");

  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByText("Unread", { exact: true })).toHaveCount(0);

  // The bell refreshes on a shared broadcast event (see
  // lib/notifications-events.ts) rather than waiting for its own 25s poll —
  // its badge should already be gone.
  await expect(page.getByRole("button", { name: /\d+ unread notifications/i })).toHaveCount(0);
});
