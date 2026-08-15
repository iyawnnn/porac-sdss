import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

function sessionCookieHeader(cookies: { name: string; value: string }[]): Record<string, string> {
  const cookie = cookies.find((c) => c.name === "ac_admin_session");
  return cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {};
}

function parseCsv(body: string): string[][] {
  return body
    .trim()
    .split("\r\n")
    .map((line) => line.split(","));
}

// --- Ticket Queue: Export CSV button -------------------------------------

test("Ticket Queue has an Export CSV button whose href includes the current filters", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets?status=Reported");
  const exportLink = page.getByRole("link", { name: "Export CSV" });
  await expect(exportLink).toBeVisible();
  const href = await exportLink.getAttribute("href");
  expect(href).toContain("/api/admin/reports/tickets.csv");
  expect(href).toContain("status=Reported");
  expect(href).toContain("office=MEO");
});

test("Ticket Queue export href updates when a filter changes", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/tickets");
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Pothole" }).click();

  const exportLink = page.getByRole("link", { name: "Export CSV" });
  await expect(exportLink).toHaveAttribute("href", /category=Pothole/);
});

// --- Work Orders: Export CSV button ---------------------------------------

test("Work Orders page has an Export CSV button whose href includes the current filters", async ({ page }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  await page.goto("/admin/work-orders?status=pending");
  const exportLink = page.getByRole("link", { name: "Export CSV" });
  await expect(exportLink).toBeVisible();
  const href = await exportLink.getAttribute("href");
  expect(href).toContain("/api/admin/reports/work-orders.csv");
  expect(href).toContain("status=pending");
  expect(href).toContain("office=MDRRMO");
});

// --- Reports & Exports page: route, sidebar, no other fake routes ---------

test("Reports & Exports sidebar link exists and no fake sidebar routes were added", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Reports & Exports", exact: true })).toBeVisible();
  // The known, real nav set for a non-system-admin. Barangay Insights and
  // Notifications (e2e/admin-barangay-insights.spec.ts,
  // e2e/admin-notifications.spec.ts) are separate, real routes added since
  // this count was fixed at 6 — both are counted here too.
  await expect(nav.getByRole("link")).toHaveCount(8);
});

test("/admin/reports page loads for an authenticated admin", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const response = await page.request.get("/admin/reports");
  expect(response.status()).toBe(200);
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports & Exports" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Printable operational summary" })).toBeVisible();
});

test("no citizen route can access the reports page", async ({ page }) => {
  // proxy.ts redirects any unauthenticated /admin/* request to /admin/login
  // (page-redirect UX only — see proxy.ts) rather than returning a bare 401,
  // matching how every other admin page route behaves.
  const response = await page.request.get("/admin/reports");
  expect(response.ok()).toBe(true);
  expect(response.url()).toContain("/admin/login");
});

test("MEO admin sees an office-scoped summary and no office picker on the reports page", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/reports");
  await expect(page.getByText("MEO office summary", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Office" })).toHaveCount(0);
  const exportLink = page.getByRole("link", { name: "Export Tickets CSV" });
  await expect(exportLink).toHaveAttribute("href", /office=MEO/);
});

test("MDRRMO admin sees an office-scoped summary and no office picker on the reports page", async ({ page }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  await page.goto("/admin/reports");
  await expect(page.getByText("MDRRMO office summary", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Office" })).toHaveCount(0);
});

test("system admin sees an office filter defaulting to city-wide on the reports page", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/reports");
  await expect(page.getByText("City-wide summary", { exact: true })).toBeVisible();
  const officeFilter = page.getByRole("combobox", { name: "Office", exact: true });
  await expect(officeFilter).toBeVisible();

  await officeFilter.click();
  await page.getByRole("option", { name: "MEO" }).click();
  await expect(page.getByText("MEO office summary", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export Tickets CSV" })).toHaveAttribute("href", /office=MEO/);
});

test("ticket export URL on the reports page includes the selected filters", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/reports");
  await page.getByLabel("Ticket category", { exact: true }).click();
  await page.getByRole("option", { name: "Pothole" }).click();
  await page.getByLabel("Ticket urgency", { exact: true }).click();
  await page.getByRole("option", { name: "High", exact: true }).click();

  const exportLink = page.getByRole("link", { name: "Export Tickets CSV" });
  await expect(exportLink).toHaveAttribute("href", /category=Pothole/);
  await expect(exportLink).toHaveAttribute("href", /urgency=High/);
});

test("work order export URL on the reports page includes the selected filters", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/reports");
  await page.getByLabel("Work order status", { exact: true }).click();
  await page.getByRole("option", { name: "Pending", exact: true }).click();

  const exportLink = page.getByRole("link", { name: "Export Work Orders CSV" });
  await expect(exportLink).toHaveAttribute("href", /status=pending/);
  await expect(exportLink).toHaveAttribute("href", /office=MEO/);
});

// --- Backend: office scoping, CSV shape, validation -----------------------

test("MEO ticket CSV export only ever contains MEO tickets", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/reports/tickets.csv?status=all", {
    headers: sessionCookieHeader(cookies),
  });
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("attachment");

  const rows = parseCsv(await res.text());
  const officeIndex = rows[0].indexOf("Assigned Office");
  expect(officeIndex).toBeGreaterThanOrEqual(0);
  for (const row of rows.slice(1)) expect(row[officeIndex]).toBe("MEO");
});

test("MDRRMO ticket CSV export only ever contains MDRRMO tickets", async ({ page, request }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/reports/tickets.csv?status=all", {
    headers: sessionCookieHeader(cookies),
  });
  expect(res.ok()).toBe(true);
  const rows = parseCsv(await res.text());
  const officeIndex = rows[0].indexOf("Assigned Office");
  for (const row of rows.slice(1)) expect(row[officeIndex]).toBe("MDRRMO");
});

test("a hand-crafted ?office=MDRRMO ticket export request from an MEO session never returns MDRRMO rows", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/reports/tickets.csv?status=all&office=MDRRMO", {
    headers: sessionCookieHeader(cookies),
  });
  const rows = parseCsv(await res.text());
  const officeIndex = rows[0].indexOf("Assigned Office");
  for (const row of rows.slice(1)) expect(row[officeIndex]).toBe("MEO");
});

test("system admin can export city-wide or filter the ticket export to one office", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const headers = sessionCookieHeader(cookies);

  const allRes = await request.get("/api/admin/reports/tickets.csv?status=all", { headers });
  expect(allRes.ok()).toBe(true);
  const allRows = parseCsv(await allRes.text());
  expect(allRows[0]).toContain("Ticket ID");

  const meoRes = await request.get("/api/admin/reports/tickets.csv?status=all&office=MEO", { headers });
  const meoRows = parseCsv(await meoRes.text());
  const officeIndex = meoRows[0].indexOf("Assigned Office");
  for (const row of meoRows.slice(1)) expect(row[officeIndex]).toBe("MEO");
});

test("ticket export filters (status, category) narrow the CSV output", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/reports/tickets.csv?status=all&category=Pothole", {
    headers: sessionCookieHeader(cookies),
  });
  expect(res.ok()).toBe(true);
  const rows = parseCsv(await res.text());
  const categoryIndex = rows[0].indexOf("Category");
  for (const row of rows.slice(1)) expect(row[categoryIndex]).toBe("Pothole");
});

test("work order CSV export respects office scope", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/reports/work-orders.csv", {
    headers: sessionCookieHeader(cookies),
  });
  expect(res.ok()).toBe(true);
  const rows = parseCsv(await res.text());
  expect(rows[0]).toEqual([
    "Work Order ID",
    "Ticket ID",
    "Title",
    "Assigned Office",
    "Assigned Admin Name",
    "Assigned Admin Email",
    "Status",
    "Overdue",
    "Due Date",
    "Completed At",
    "Created At",
    "Updated At",
  ]);
  const officeIndex = rows[0].indexOf("Assigned Office");
  for (const row of rows.slice(1)) expect(row[officeIndex]).toBe("MEO");
});

test("work order CSV export never includes a notes column", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/reports/work-orders.csv", {
    headers: sessionCookieHeader(cookies),
  });
  const [header] = parseCsv(await res.text());
  expect(header.map((h) => h.toLowerCase())).not.toContain("notes");
});

test("work order CSV export never leaks a note body, even though the column itself is absent", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  const cookies = await page.context().cookies();
  const headers = sessionCookieHeader(cookies);

  // Reuse an existing ticket rather than creating a new report — this test
  // only cares about the work order's notes field, not which ticket it's
  // attached to, so any ticket works. Zero reports created (docs/testing.md §6).
  const ticketsRes = await request.get("/api/admin/tickets?status=all&limit=1", { headers });
  const { tickets } = await ticketsRes.json();
  test.skip(tickets.length === 0, "no tickets exist — run `pnpm --prefix api seed:diverse-reports` first");
  const ticketId = tickets[0].id;

  const sentinel = `SECRET-CSV-NOTE-${Date.now()}`;
  const createRes = await request.post("/api/admin/work-orders", {
    headers: { ...headers, "content-type": "application/json" },
    data: { ticketId, title: `E2E CSV note-leak check ${Date.now()}`, notes: sentinel, assignedAdminId: null, dueDate: null },
  });
  expect(createRes.ok()).toBe(true);

  const csvRes = await request.get("/api/admin/reports/work-orders.csv?status=all", { headers });
  expect(csvRes.ok()).toBe(true);
  expect(await csvRes.text()).not.toContain(sentinel);
});

test("invalid export query params fail safely, not with a crash", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const headers = sessionCookieHeader(cookies);

  // A garbage date is a real 400, not a silent no-op or a 500.
  const badDate = await request.get("/api/admin/reports/tickets.csv?dateFrom=not-a-date", { headers });
  expect(badDate.status()).toBe(400);

  const badRange = await request.get(
    "/api/admin/reports/tickets.csv?dateFrom=2026-06-01&dateTo=2026-01-01",
    { headers },
  );
  expect(badRange.status()).toBe(400);

  // An unrecognized category/status falls back safely (same convention as
  // every other admin list endpoint) rather than erroring.
  const badCategory = await request.get("/api/admin/reports/tickets.csv?category=NotReal", { headers });
  expect(badCategory.ok()).toBe(true);
});

test("an empty result set still produces a valid CSV with just a header row", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get(
    "/api/admin/reports/tickets.csv?status=all&category=Illegal%20Dumping&dateFrom=1999-01-01&dateTo=1999-01-02",
    { headers: sessionCookieHeader(cookies) },
  );
  expect(res.ok()).toBe(true);
  const rows = parseCsv(await res.text());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain("Ticket ID");
});

test("citizens cannot access the export endpoints", async ({ request }) => {
  const ticketsRes = await request.get("/api/admin/reports/tickets.csv");
  expect(ticketsRes.status()).toBe(401);
  const workOrdersRes = await request.get("/api/admin/reports/work-orders.csv");
  expect(workOrdersRes.status()).toBe(401);
});
