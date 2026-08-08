import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

function sessionCookieHeader(cookies: { name: string; value: string }[]): Record<string, string> {
  const cookie = cookies.find((c) => c.name === "ac_admin_session");
  return cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {};
}

async function ticketIdFor(page: Page, request: import("@playwright/test").APIRequestContext, office: "MEO" | "MDRRMO"): Promise<number> {
  const cookies = await page.context().cookies();
  const res = await request.get(`/api/admin/tickets?office=${office}&status=all&limit=1`, { headers: sessionCookieHeader(cookies) });
  const body = await res.json();
  expect(body.tickets.length).toBeGreaterThan(0);
  return body.tickets[0].id as number;
}

// Isolated incognito context so a lookup as another role never mutates the
// calling test's own cookie jar (the "page"/"request" fixtures share one
// cookie store per browser context) — used whenever a test needs a ticket
// id from an office the logged-in admin can't list themselves.
//
// Demo seed data (seed-diverse-reports.ts) doesn't guarantee an MDRRMO
// ticket exists, so this falls back to reassigning any ticket to the
// target office via the already-covered POST /admin/tickets/:id/reassign
// endpoint rather than depending on seed content this spec doesn't own.
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
  const ticketId = anyBody.tickets[0].id as number;
  const reassign = await context.request.post(`/api/admin/tickets/${ticketId}/reassign`, { headers, data: { toOffice: office } });
  expect(reassign.ok()).toBe(true);
  await context.close();
  return ticketId;
}

async function createWorkOrderAsSystemAdmin(browser: Browser, ticketId: number, title: string): Promise<{ id: number; assigned_office: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await context.cookies();
  const res = await context.request.post("/api/admin/work-orders", {
    headers: { ...sessionCookieHeader(cookies), "content-type": "application/json" },
    data: { ticketId, title, notes: null, assignedAdminId: null, dueDate: null },
  });
  expect(res.ok()).toBe(true);
  const created = await res.json();
  await context.close();
  return created;
}

test("Work Orders sidebar link is visible and navigates to the list page", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const nav = page.getByRole("navigation", { name: "Admin" });
  const link = nav.getByRole("link", { name: "Work Orders" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/admin\/work-orders$/);
  await expect(page.getByRole("heading", { name: "Work Orders" })).toBeVisible();
});

test("/admin/work-orders loads for a system admin with an office picker", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/work-orders");
  await expect(page.getByRole("heading", { name: "Work Orders" })).toBeVisible();
  await expect(page.getByLabel("Office", { exact: true })).toBeVisible();
});

test("MEO office admin sees a fixed office badge, not a picker", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/work-orders");
  await expect(page.getByRole("combobox", { name: "Office" })).toHaveCount(0);
  await expect(page.getByLabel("Office", { exact: true })).toHaveText("My Office: MEO");
});

test("MDRRMO office admin sees a fixed office badge, not a picker", async ({ page }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  await page.goto("/admin/work-orders");
  await expect(page.getByRole("combobox", { name: "Office" })).toHaveCount(0);
  await expect(page.getByLabel("Office", { exact: true })).toHaveText("My Office: MDRRMO");
});

test("create a work order from Ticket Detail and see it in the panel", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const ticketId = await ticketIdFor(page, request, "MEO");
  await page.goto(`/admin/tickets/${ticketId}`);

  const title = `E2E work order ${Date.now()}`;
  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create work order" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByText(title)).toBeVisible();
});

test("update a work order's status from Ticket Detail", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const ticketId = await ticketIdFor(page, request, "MEO");
  await page.goto(`/admin/tickets/${ticketId}`);

  const title = `E2E status update ${Date.now()}`;
  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create work order" }).click();
  await expect(dialog).toHaveCount(0);

  const item = page.locator("li", { hasText: title });
  await item.getByRole("combobox").click();
  await page.getByRole("option", { name: "In Progress" }).click();
  // "In Progress" renders twice inside the item (status badge + select
  // value) — assert on the first match rather than requiring uniqueness.
  await expect(item.getByText("In Progress").first()).toBeVisible();
});

test("MEO office admin cannot create a work order on an MDRRMO ticket (server-side rejection)", async ({ page, request, browser }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const mdrrmoTicketId = await ticketIdAsSystemAdmin(browser, "MDRRMO");
  const cookies = await page.context().cookies();
  const res = await request.post("/api/admin/work-orders", {
    headers: { ...sessionCookieHeader(cookies), "content-type": "application/json" },
    data: { ticketId: mdrrmoTicketId, title: "Should be blocked", notes: null, assignedAdminId: null, dueDate: null },
  });
  expect(res.status()).toBe(403);
});

test("MEO office admin cannot read, update, or change the status of an MDRRMO work order", async ({ page, request, browser }) => {
  const mdrrmoTicketId = await ticketIdAsSystemAdmin(browser, "MDRRMO");
  const created = await createWorkOrderAsSystemAdmin(browser, mdrrmoTicketId, `E2E cross-office ${Date.now()}`);
  expect(created.assigned_office).toBe("MDRRMO");

  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const headers = { ...sessionCookieHeader(cookies), "content-type": "application/json" };

  const getRes = await request.get(`/api/admin/work-orders/${created.id}`, { headers });
  expect(getRes.status()).toBe(403);

  const patchRes = await request.patch(`/api/admin/work-orders/${created.id}`, { headers, data: { title: "Hijacked" } });
  expect(patchRes.status()).toBe(403);

  const statusRes = await request.post(`/api/admin/work-orders/${created.id}/status`, { headers, data: { status: "in_progress" } });
  expect(statusRes.status()).toBe(403);

  // The list endpoint clamps rather than rejecting — it must not leak the
  // MDRRMO row even when the office param explicitly asks for MDRRMO.
  const listRes = await request.get("/api/admin/work-orders?office=MDRRMO&limit=50", { headers });
  const listBody = await listRes.json();
  expect(listBody.workOrders.every((w: { assigned_office: string }) => w.assigned_office === "MEO")).toBe(true);
});

test("MDRRMO office admin cannot reach a MEO work order either (both offices are enforced, not just one)", async ({ page, request, browser }) => {
  const meoTicketId = await ticketIdAsSystemAdmin(browser, "MEO");
  const created = await createWorkOrderAsSystemAdmin(browser, meoTicketId, `E2E cross-office ${Date.now()}`);
  expect(created.assigned_office).toBe("MEO");

  await loginAs(page, E2E_MDRRMO_ADMIN);
  const cookies = await page.context().cookies();
  const headers = { ...sessionCookieHeader(cookies), "content-type": "application/json" };

  const getRes = await request.get(`/api/admin/work-orders/${created.id}`, { headers });
  expect(getRes.status()).toBe(403);
});

test("system admin can view and act on work orders from any office", async ({ page, request, browser }) => {
  const mdrrmoTicketId = await ticketIdAsSystemAdmin(browser, "MDRRMO");

  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const headers = { ...sessionCookieHeader(cookies), "content-type": "application/json" };

  const createRes = await request.post("/api/admin/work-orders", {
    headers,
    data: { ticketId: mdrrmoTicketId, title: `E2E sysadmin ${Date.now()}`, notes: null, assignedAdminId: null, dueDate: null },
  });
  expect(createRes.ok()).toBe(true);
  const created = await createRes.json();

  const statusRes = await request.post(`/api/admin/work-orders/${created.id}/status`, { headers, data: { status: "completed" } });
  expect(statusRes.ok()).toBe(true);
  const updated = await statusRes.json();
  expect(updated.status).toBe("completed");
  expect(updated.completed_at).not.toBeNull();
});

test("audit events are written for work order creation and status changes", async ({ page, request, browser }) => {
  const meoTicketId = await ticketIdAsSystemAdmin(browser, "MEO");

  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const headers = { ...sessionCookieHeader(cookies), "content-type": "application/json" };

  const title = `E2E audit ${Date.now()}`;
  const createRes = await request.post("/api/admin/work-orders", {
    headers,
    data: { ticketId: meoTicketId, title, notes: null, assignedAdminId: null, dueDate: null },
  });
  const created = await createRes.json();
  await request.post(`/api/admin/work-orders/${created.id}/status`, { headers, data: { status: "cancelled" } });

  const auditRes = await request.get(`/api/admin/activity-log?targetType=work_order&limit=50`, { headers });
  const auditBody = await auditRes.json();
  const summaries = auditBody.events.map((e: { target_summary: string }) => e.target_summary);
  expect(summaries.some((s: string) => s.includes(`Work order #${created.id}`))).toBe(true);
  const actionTypes = auditBody.events
    .filter((e: { target_id: number }) => e.target_id === created.id)
    .map((e: { action_type: string }) => e.action_type);
  expect(actionTypes).toEqual(expect.arrayContaining(["work_order_created", "work_order_cancelled"]));
});

test("citizens have no access to work-order routes or data", async ({ request }) => {
  const list = await request.get("/api/admin/work-orders");
  expect(list.status()).toBe(401);
  const create = await request.post("/api/admin/work-orders", {
    data: { ticketId: 1, title: "Should be blocked", notes: null, assignedAdminId: null, dueDate: null },
  });
  expect(create.status()).toBe(401);
});

test("mobile viewport renders the work orders card list, not the desktop table", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/work-orders");
  await expect(page.getByRole("heading", { name: "Work Orders" })).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
});
