import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

function sessionCookieHeader(cookies: { name: string; value: string }[]): Record<string, string> {
  const cookie = cookies.find((c) => c.name === "ac_admin_session");
  return cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {};
}

// Same "borrow a ticket via system admin, restore in afterAll" pattern as
// e2e/admin-work-orders.spec.ts's ticketIdAsSystemAdmin — demo seed data
// (seed-diverse-reports.ts) doesn't guarantee an MDRRMO ticket exists, so
// this reassigns one via the already-covered reassign endpoint rather than
// depending on seed content this spec doesn't own.
let borrowedTicket: { id: number; originalOffice: "MEO" | "MDRRMO" } | null = null;

async function ticketIdAsSystemAdmin(browser: Browser, office: "MEO" | "MDRRMO"): Promise<number> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await context.cookies();
  const headers = { ...sessionCookieHeader(cookies), "content-type": "application/json" };

  const res = await context.request.get(`/api/admin/tickets?office=${office}&status=all&limit=1`, { headers });
  const body = await res.json();
  if (body.tickets.length > 0) {
    await context.close();
    return body.tickets[0].id as number;
  }

  const anyTicket = await context.request.get(`/api/admin/tickets?office=all&status=all&limit=1`, { headers });
  const anyBody = await anyTicket.json();
  expect(anyBody.tickets.length).toBeGreaterThan(0);
  const ticket = anyBody.tickets[0] as { id: number; assigned_office: "MEO" | "MDRRMO" };
  const reassign = await context.request.post(`/api/admin/tickets/${ticket.id}/reassign`, { headers, data: { toOffice: office } });
  expect(reassign.ok()).toBe(true);
  borrowedTicket = { id: ticket.id, originalOffice: ticket.assigned_office };
  await context.close();
  return ticket.id;
}

test.afterAll(async ({ browser }) => {
  if (!borrowedTicket) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, E2E_SYSTEM_ADMIN);
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

test("system admin sees office-wide notifications from both offices", async ({ page, browser }) => {
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
  await expect(page.getByText(meoTitle)).toBeVisible();
  await expect(page.getByText(mdrrmoTitle)).toBeVisible();
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
