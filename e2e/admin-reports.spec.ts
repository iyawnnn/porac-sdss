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

// --- No fake route/sidebar item --------------------------------------------

test("no fake sidebar route was added for reports/exports", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link")).toHaveCount(5);
  const response = await page.request.get("/admin/reports");
  expect(response.status()).toBe(404);
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
