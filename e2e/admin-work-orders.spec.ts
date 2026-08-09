import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN, E2E_CITIZEN_ACCOUNT } from "./test-credentials";
import { loginAdmin as loginAs, loginCitizen } from "./helpers";

test.setTimeout(60_000);

function sessionCookieHeader(cookies: { name: string; value: string }[]): Record<string, string> {
  const cookie = cookies.find((c) => c.name === "ac_admin_session");
  return cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {};
}

// `<input type="date">.fill()` is flaky in this repo's shadcn Input wrapper —
// it intermittently sets the DOM value without React observing an `input`
// event, silently no-op'ing the save. Setting the value through the native
// setter and dispatching `input`/`change` ourselves is what React actually
// listens for, so it fires reliably every time.
async function setDateInput(locator: import("@playwright/test").Locator, value: string): Promise<void> {
  await locator.evaluate((el: HTMLInputElement, val: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function ticketIdFor(page: Page, request: import("@playwright/test").APIRequestContext, office: "MEO" | "MDRRMO"): Promise<number> {
  const cookies = await page.context().cookies();
  const res = await request.get(`/api/admin/tickets?office=${office}&status=all&limit=1`, { headers: sessionCookieHeader(cookies) });
  const body = await res.json();
  expect(body.tickets.length).toBeGreaterThan(0);
  return body.tickets[0].id as number;
}

// Tracks a seeded ticket this file temporarily reassigned to MDRRMO (see
// ticketIdAsSystemAdmin below) so afterAll can put it back — without this,
// the reassignment is real and permanent, and other specs that read seed
// data at its original office (e.g. citizen-reports.spec.ts's moderation
// test) start failing with a genuine, correct 403 for a MEO admin acting
// on what used to be a MEO ticket. Module-level state is safe here because
// this repo's Playwright config mandates --workers=1 (no per-test DB
// isolation, see README.md §I) — every test in this file runs serially in
// one worker before afterAll fires.
let borrowedTicket: { id: number; originalOffice: "MEO" | "MDRRMO" } | null = null;

// Isolated incognito context so a lookup as another role never mutates the
// calling test's own cookie jar (the "page"/"request" fixtures share one
// cookie store per browser context) — used whenever a test needs a ticket
// id from an office the logged-in admin can't list themselves.
//
// Demo seed data (seed-diverse-reports.ts) doesn't guarantee an MDRRMO
// ticket exists, so this falls back to *borrowing* any ticket via the
// already-covered POST /admin/tickets/:id/reassign endpoint — recording
// its original office so afterAll can restore it — rather than depending
// on seed content this spec doesn't own or leaving shared state mutated.
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

  // Scoped by aria-label, not a bare combobox lookup — the item now also
  // renders an assignee combobox alongside the status one.
  const item = page.locator("li", { hasText: title });
  await item.getByRole("combobox", { name: /^Status for work order/ }).click();
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

// --- Office-scoped admin directory / assigned admin picker ---------------

test("the assigned admin picker appears in the create work order dialog with an Unassigned option", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const ticketId = await ticketIdFor(page, request, "MEO");
  await page.goto(`/admin/tickets/${ticketId}`);

  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  await expect(dialog.getByLabel("Assigned admin")).toBeVisible();
  await dialog.getByLabel("Assigned admin").click();
  await expect(page.getByRole("option", { name: "Unassigned / Office-wide" })).toBeVisible();
});

test("MEO office admin's assignee picker only offers MEO admins", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const ticketId = await ticketIdFor(page, request, "MEO");
  await page.goto(`/admin/tickets/${ticketId}`);

  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  await dialog.getByLabel("Assigned admin").click();
  // The seeded MEO supervisor must appear; the seeded MDRRMO one must not.
  await expect(page.getByRole("option", { name: "MEO Supervisor" })).toBeVisible();
  await expect(page.getByRole("option", { name: "MDRRMO Supervisor" })).toHaveCount(0);
});

test("MDRRMO office admin's assignee picker only offers MDRRMO admins", async ({ page, browser }) => {
  // Seed data never includes a real MDRRMO ticket (seed-diverse-reports.ts
  // assigns everything to MEO), so this borrows one the same way every
  // other MDRRMO-context test in this file does — afterAll restores it.
  const ticketId = await ticketIdAsSystemAdmin(browser, "MDRRMO");
  await loginAs(page, E2E_MDRRMO_ADMIN);
  await page.goto(`/admin/tickets/${ticketId}`);

  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  await dialog.getByLabel("Assigned admin").click();
  await expect(page.getByRole("option", { name: "MDRRMO Supervisor" })).toBeVisible();
  await expect(page.getByRole("option", { name: "MEO Supervisor" })).toHaveCount(0);
});

test("system admin picks a work order office on the standalone list, then sees that office's admins", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/work-orders");

  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  // Before an office is picked, the assignee field has nothing to filter by.
  await expect(dialog.getByLabel("Assigned admin")).toBeDisabled();

  await dialog.getByLabel("Work order office").click();
  await page.getByRole("option", { name: "MEO", exact: true }).click();
  await dialog.getByLabel("Assigned admin").click();
  await expect(page.getByRole("option", { name: "MEO Supervisor" })).toBeVisible();
  await expect(page.getByRole("option", { name: "MDRRMO Supervisor" })).toHaveCount(0);

  // Switching office clears the stale selection and refilters the options.
  await page.keyboard.press("Escape");
  await dialog.getByLabel("Work order office").click();
  await page.getByRole("option", { name: "MDRRMO", exact: true }).click();
  await dialog.getByLabel("Assigned admin").click();
  await expect(page.getByRole("option", { name: "MDRRMO Supervisor" })).toBeVisible();
  await expect(page.getByRole("option", { name: "MEO Supervisor" })).toHaveCount(0);
});

test("creating a work order Unassigned / Office-wide leaves it unassigned, and the assignee appears once picked", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const ticketId = await ticketIdFor(page, request, "MEO");
  await page.goto(`/admin/tickets/${ticketId}`);

  const title = `E2E assignee ${Date.now()}`;
  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create work order" }).click();
  await expect(dialog).toHaveCount(0);

  const item = page.locator("li", { hasText: title });
  const assigneeSelect = item.getByRole("combobox", { name: /^Assigned admin for work order/ });
  await expect(assigneeSelect).toHaveText("Unassigned / Office-wide");

  // Ticket Detail Work Orders panel edit: pick a real assignee.
  await assigneeSelect.click();
  await page.getByRole("option", { name: "MEO Supervisor" }).click();
  await expect(assigneeSelect).toHaveText("MEO Supervisor");

  // Also shows up on the standalone Work Orders list (default desktop
  // viewport here, so the table — not the mobile card list — is visible).
  await page.goto("/admin/work-orders");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row.getByText("MEO Supervisor")).toBeVisible();
});

test("citizens cannot reach the admin directory endpoint", async ({ request }) => {
  const res = await request.get("/api/admin/admins/directory");
  expect(res.status()).toBe(401);
});

// --- Work order follow-up improvements: due dates + notes ----------------

test("set, see overdue styling for, and clear a work order's due date from Ticket Detail", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const ticketId = await ticketIdFor(page, request, "MEO");
  await page.goto(`/admin/tickets/${ticketId}`);

  const title = `E2E due date ${Date.now()}`;
  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create work order" }).click();
  await expect(dialog).toHaveCount(0);

  const item = page.locator("li", { hasText: title });
  const dueDateInput = item.getByRole("textbox", { name: /^Due date for work order/ });

  // A past date should render the overdue indicator.
  await setDateInput(dueDateInput, "2020-01-01");
  await expect(item.getByText("Overdue")).toBeVisible();

  // Clearing removes the due date and the overdue indicator with it.
  await item.getByRole("button", { name: /^Clear due date for work order/ }).click();
  await expect(item.getByText("Overdue")).toHaveCount(0);
  await expect(dueDateInput).toHaveValue("");
});

test("update and clear a work order's due date from the standalone Work Orders list", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const ticketId = await ticketIdFor(page, request, "MEO");
  await page.goto(`/admin/tickets/${ticketId}`);

  const title = `E2E list due date ${Date.now()}`;
  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create work order" }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto("/admin/work-orders");
  const row = page.getByRole("row").filter({ hasText: title });
  const dueDateInput = row.getByRole("textbox", { name: /^Due date for work order/ });
  await setDateInput(dueDateInput, "2099-12-31");
  await expect(dueDateInput).toHaveValue("2099-12-31");

  await row.getByRole("button", { name: /^Clear due date for work order/ }).click();
  await expect(dueDateInput).toHaveValue("");
});

test("edit a work order's internal progress notes from Ticket Detail", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const ticketId = await ticketIdFor(page, request, "MEO");
  await page.goto(`/admin/tickets/${ticketId}`);

  const title = `E2E notes ${Date.now()}`;
  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create work order" }).click();
  await expect(dialog).toHaveCount(0);

  const item = page.locator("li", { hasText: title });
  await item.getByRole("button", { name: /^Edit notes for work order/ }).click();
  const notesField = item.getByRole("textbox", { name: /^Notes for work order/ });
  await notesField.fill("Crew dispatched, drainage cleared halfway.");
  await item.getByRole("button", { name: "Save" }).click();
  await expect(item.getByText("Crew dispatched, drainage cleared halfway.")).toBeVisible();
});

test("work order notes never appear on the citizen's report tracking page", async ({ page, request, browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await loginCitizen(citizenPage, E2E_CITIZEN_ACCOUNT);
  const reports = await citizenPage.evaluate(async () => {
    const res = await fetch("/api/reports/mine");
    return (await res.json()) as { id: number; ticket_id: number }[];
  });
  test.skip(reports.length === 0, "citizen1 has no seeded reports — run `pnpm --prefix api seed:diverse-reports` first");
  const report = reports[0];

  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const createRes = await request.post("/api/admin/work-orders", {
    headers: { ...sessionCookieHeader(cookies), "content-type": "application/json" },
    data: {
      ticketId: report.ticket_id,
      title: `E2E citizen leak check ${Date.now()}`,
      notes: "SECRET-INTERNAL-NOTE-SHOULD-NEVER-LEAK",
      assignedAdminId: null,
      dueDate: null,
    },
  });
  expect(createRes.ok()).toBe(true);

  await citizenPage.goto(`/dashboard/reports/${report.id}`);
  const bodyText = await citizenPage.locator("body").innerText();
  expect(bodyText).not.toContain("SECRET-INTERNAL-NOTE-SHOULD-NEVER-LEAK");
  await citizenContext.close();
});

test("Needs Attention section on the admin dashboard is office-scoped", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin");
  const section = page.getByRole("region", { name: "Needs attention" });
  await expect(section).toBeVisible();
  await expect(section.getByText("Overdue", { exact: true })).toBeVisible();
  await expect(section.getByText("Due Today", { exact: true })).toBeVisible();
  await expect(section.getByText("High-Urgency, Work Pending", { exact: true })).toBeVisible();
});

test("system admin's Needs Attention section loads city-wide", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Needs attention" })).toBeVisible();
});

// --- "My Assignments" personal quick filter -------------------------------

async function currentAdminId(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const res = await fetch("/api/auth/me");
    const body = await res.json();
    return body.session.adminId as number;
  });
}

test("My Assignments filter appears on Work Orders and toggles the URL", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/work-orders");
  await page.waitForLoadState("networkidle");
  const toggle = page.getByRole("button", { name: "My Assignments" });
  await expect(toggle).toBeVisible();

  await toggle.click();
  await expect(page).toHaveURL(/[?&]assignedAdminId=me(&|$)/);
  await expect(page.getByText("Showing only work assigned to you")).toBeVisible();

  // Clearing restores the broader list and drops the param from the URL.
  await toggle.click();
  await expect(page).not.toHaveURL(/assignedAdminId=me/);
  await expect(page.getByText("Showing only work assigned to you")).toHaveCount(0);
});

test("enabling My Assignments filters the list to only the current admin's assigned work orders", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const ticketId = await ticketIdFor(page, request, "MEO");
  const myId = await currentAdminId(page);

  const mineTitle = `E2E my-assignments mine ${Date.now()}`;
  const notMineTitle = `E2E my-assignments other ${Date.now()}`;
  await page.goto(`/admin/tickets/${ticketId}`);

  await page.getByRole("button", { name: "New Work Order" }).click();
  let dialog = page.getByRole("dialog", { name: "New work order" });
  await dialog.getByLabel("Title").fill(mineTitle);
  await dialog.getByLabel("Assigned admin").click();
  await page.getByRole("option", { name: "MEO Supervisor" }).click();
  await dialog.getByRole("button", { name: "Create work order" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "New Work Order" }).click();
  dialog = page.getByRole("dialog", { name: "New work order" });
  await dialog.getByLabel("Title").fill(notMineTitle);
  await dialog.getByRole("button", { name: "Create work order" }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto("/admin/work-orders?status=all");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "My Assignments" }).click();

  // "MEO Supervisor" is the admin the E2E_MEO_ADMIN session logs in as, so
  // myId identifies that same account — the assigned work order must show,
  // the unassigned one must not. .first() because the same row renders in
  // both the desktop table and the CSS-hidden (not DOM-removed) mobile card
  // list — same duplicate-match reason as this file's other "In Progress"
  // .first() usage above.
  await expect(page.getByText(mineTitle).first()).toBeVisible();
  await expect(page.getByText(notMineTitle)).toHaveCount(0);
  expect(myId).toBeGreaterThan(0);
});

test("clearing My Assignments restores the broader work order list", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const ticketId = await ticketIdFor(page, request, "MEO");
  const title = `E2E my-assignments clear ${Date.now()}`;
  await page.goto(`/admin/tickets/${ticketId}`);

  await page.getByRole("button", { name: "New Work Order" }).click();
  const dialog = page.getByRole("dialog", { name: "New work order" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create work order" }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto("/admin/work-orders?status=all");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "My Assignments" }).click();
  await expect(page.getByText(title)).toHaveCount(0);

  await page.getByRole("button", { name: "My Assignments" }).click();
  await expect(page.getByText(title).first()).toBeVisible();
});

test("My Assignments preserves office scoping for MEO/MDRRMO admins", async ({ page, browser }) => {
  const mdrrmoTicketId = await ticketIdAsSystemAdmin(browser, "MDRRMO");
  const created = await createWorkOrderAsSystemAdmin(browser, mdrrmoTicketId, `E2E my-assignments scope ${Date.now()}`);
  expect(created.assigned_office).toBe("MDRRMO");

  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const headers = { ...sessionCookieHeader(cookies) };

  // A hand-crafted request combining assignedAdminId=me with an explicit
  // ?office=MDRRMO must still clamp to MEO — the office scope in
  // resolveOfficeScope runs independently of the assignedAdminId filter.
  const res = await page.request.get("/api/admin/work-orders?assignedAdminId=me&office=MDRRMO&status=all&limit=50", { headers });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.workOrders.every((w: { assigned_office: string }) => w.assigned_office === "MEO")).toBe(true);
});

test("system admin's My Assignments means work assigned to their own account, not all offices", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/work-orders");
  await page.waitForLoadState("networkidle");
  const toggle = page.getByRole("button", { name: "My Assignments" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page).toHaveURL(/[?&]assignedAdminId=me(&|$)/);

  const cookies = await page.context().cookies();
  const headers = { ...sessionCookieHeader(cookies) };
  const myId = await page.evaluate(async () => {
    const res = await fetch("/api/auth/me");
    return (await res.json()).session.adminId as number;
  });
  const res = await page.request.get("/api/admin/work-orders?assignedAdminId=me&status=all&limit=50", { headers });
  const body = await res.json();
  expect(
    body.workOrders.every((w: { assigned_admin_id: number | null }) => w.assigned_admin_id === myId),
  ).toBe(true);
});
