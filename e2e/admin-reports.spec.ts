import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN, E2E_FOCAL_ADMIN } from "./test-credentials";
import { ensureAssessment, loginAdmin as loginAs, settleAdminPage } from "./helpers";

test.setTimeout(60_000);

function sessionCookieHeader(cookies: { name: string; value: string }[]): Record<string, string> {
  const cookie = cookies.find((c) => c.name === "ac_admin_session");
  return cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {};
}

function parseCsv(body: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === '"') {
      if (quoted && body[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if (char === "\n" && !quoted) { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r" || quoted) field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// New fixtures only INSERT; audit events accumulate and are never deleted.
const exportFixtures = process.env.E2E_GROUPING_FIXTURES
  ? (JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { exportHardening: {
      office: string; reportId: number; trackingReference: string; title: string; citizenName: string;
    }[] }).exportHardening : [];

for (const account of [E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN]) {
  test(`${account.office} flagged file download has tracking reference without citizen identity or title`, async ({ page }) => {
    const own = exportFixtures.find(f => f.office === account.office);
    const other = exportFixtures.find(f => f.office !== account.office);
    expect(own, "global setup must insert export fixtures").toBeTruthy();
    expect(other).toBeTruthy();
    if (!own || !other) throw new Error("Missing export fixtures");
    await loginAs(page, account);
    await page.goto(`/admin/flagged?status=all&search=${encodeURIComponent(own.title)}`);
    await settleAdminPage(page, page.getByRole("heading", { name: "Flagged Reports" }));
    const link = page.getByRole("link", { name: "Export CSV", exact: true });
    const downloadPromise = page.waitForEvent("download");
    await link.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^flagged-reports-.*\.csv$/);
    const file = await download.path();
    if (!file) throw new Error("Download has no file");
    const body = await readFile(file, "utf8");
    const [headers, ...rows] = parseCsv(body);
    expect(headers).toEqual(["Report ID","Ticket ID","Tracking Reference","Category","Barangay","Assigned Office","Citizen Severity","Flags","Location Mismatch (m)","Moderation Status","Moderated By","Moderated At","Submitted At"]);
    expect(body).toContain(own.trackingReference);
    expect(body).not.toContain(own.title);
    expect(body).not.toContain(own.citizenName);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row[5]).toBe(account.office);
    const scoped = await page.request.get(`/api/admin/reports/flagged.csv?status=all&office=${other.office}&ids=${own.reportId},${other.reportId}`);
    const scopedRows = parseCsv(await scoped.text()).slice(1);
    expect(scopedRows).toHaveLength(1);
    expect(scopedRows[0][0]).toBe(String(own.reportId));

    // The login page redirects an existing staff session to its dashboard.
    await page.context().clearCookies();
    await loginAs(page, E2E_SYSTEM_ADMIN);
    await page.goto("/admin/activity-log?actionType=report_exported&targetType=export");
    await settleAdminPage(page, page.getByRole("heading", { name: "Activity Log" }));
    const event = page.getByRole("row").filter({ hasText: "Report export" }).filter({ hasText: "flagged" }).first();
    await expect(event).toBeVisible();
    await expect(event).toContainText("Rows: 1");
    await expect(event).toContainText("Office: " + account.office);
    const audit = await page.request.get("/api/admin/activity-log?actionType=report_exported&limit=100");
    const data = await audit.json();
    expect(data.events.some((e: { details: { kind: string; rowCount: number; office: string } }) =>
      e.details.kind === "flagged" && e.details.rowCount === 1 && e.details.office === account.office)).toBe(true);
    expect(JSON.stringify(data)).not.toContain(own.title);
    expect(JSON.stringify(data)).not.toContain(own.citizenName);
  });
}

for (const account of [E2E_FOCAL_ADMIN, E2E_SYSTEM_ADMIN]) {
  test(`${account.role} is refused all export endpoints`, async ({ page }) => {
    await loginAs(page, account);
    for (const kind of ["tickets", "flagged", "work-orders", "submitted-reports", "operational-assessments", "priority-incidents"]) {
      const response = await page.request.get(`/api/admin/reports/${kind}.csv`);
      expect(response.status()).toBe(403);
      expect(response.headers()["content-disposition"]).toBeUndefined();
    }
  });
}

test("work-order export retains notes exclusion and adds cancellation headers", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const response = await page.request.get("/api/admin/reports/work-orders.csv");
  expect(response.ok()).toBe(true);
  const [header] = parseCsv(await response.text());
  expect(header).toEqual(["Work Order ID","Ticket ID","Title","Assigned Office","Assigned Admin Name","Assigned Admin Email","Status","Overdue","Due Date","Completed At","Cancelled At","Cancellation Reason","Replacement Work Order ID","Created At","Updated At"]);
  expect(header).not.toContain("Notes");
});

// --- Ticket Queue: Export CSV button -------------------------------------

type NewExportFixture = { office: string; ticketIds: number[]; reportIds: number[]; references: string[]; assessedConditions: string; citizenName: string };
const newExportFixtures = process.env.E2E_GROUPING_FIXTURES
  ? (JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { newExports: NewExportFixture[] }).newExports : [];

async function downloadRows(page: import('@playwright/test').Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name, exact: true }).click();
  const download = await pending;
  const file = await download.path();
  if (!file) throw new Error('Download file missing');
  return parseCsv(await readFile(file, 'utf8'));
}

for (const account of [E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN]) {
  test(`${account.office} downloads the three new office-scoped exports and MIS sees their safe audit details`, async ({ page }) => {
    const fixture = newExportFixtures.find(f => f.office === account.office);
    expect(fixture, 'global setup must insert new export fixtures').toBeTruthy();
    if (!fixture) throw new Error('Missing new export fixture');
    await loginAs(page, account);
    await page.goto('/admin/reports');
    await settleAdminPage(page, page.getByRole('heading', { name: 'Reports & Exports' }));
    await page.getByLabel('Submitted from (Manila)', { exact: true }).fill('2001-01-02');
    await page.getByLabel('Submitted to (Manila)', { exact: true }).fill('2001-01-02');
    const submitted = await downloadRows(page, 'Export Submitted Reports CSV');
    expect(submitted[0]).toEqual(['Tracking Reference','Ticket ID','Ticket Status','Assigned Office','Category','Submitted Category','Barangay','Citizen Severity','Evidence Flags','Severity Screening Status','Moderation Status','Submitted At']);
    for (const row of submitted.slice(1)) expect(row[3]).toBe(account.office);
    for (const reference of fixture.references.slice(0, 4)) expect(submitted.some(row => row[0] === reference)).toBe(true);
    expect(submitted.some(row => row[0] === fixture.references[4])).toBe(false);
    const submittedText = JSON.stringify(submitted);
    for (const text of [fixture.citizenName, 'E2E reporting fixture', 'PRIVATE_EXPORT_DESCRIPTION', '/uploads/reports/01_poblacion.jpg']) expect(submittedText).not.toContain(text);

    await page.getByLabel('Assessed from (Manila)', { exact: true }).fill('2001-01-02');
    await page.getByLabel('Assessed to (Manila)', { exact: true }).fill('2001-01-02');
    const assessments = await downloadRows(page, 'Export Operational Assessments CSV');
    const assessmentHeaders = assessments[0];
    expect(assessmentHeaders).toContain('Assessed Conditions'); expect(assessmentHeaders).toContain('Interim Mitigation');
    expect(assessmentHeaders).not.toContain('Observed Conditions'); expect(assessmentHeaders).not.toContain('Temporary Mitigation');
    expect(assessmentHeaders).not.toContain('Assessment Count');
    for (const row of assessments.slice(1)) expect(row[1]).toBe(account.office);
    const ownAssessment = assessments.find(row => row[0] === String(fixture.ticketIds[0]));
    expect(ownAssessment).toBeTruthy();
    expect(ownAssessment?.[assessmentHeaders.indexOf('Assessed Conditions')]).toBe(fixture.assessedConditions);
    expect(ownAssessment?.[assessmentHeaders.indexOf('Interim Mitigation')]).toBe('Fixture interim mitigation');
    expect(ownAssessment?.slice(-4)).toEqual(['1','1','1','1']);
    expect(JSON.stringify(assessments)).not.toContain('PRIVATE_WORK_ORDER_NOTE');

    const top = page.getByLabel('Top N', { exact: true });
    await expect(top).toHaveValue('20'); await expect(top).toHaveAttribute('min','1'); await expect(top).toHaveAttribute('max','200');
    await top.fill('1');
    const first = await downloadRows(page, 'Export Priority Incidents CSV');
    expect(first[0]).toEqual(['Rank','Ticket ID','Status','Assigned Office','Operational Priority','Category','Hazard Information','Barangay','Report Count','Created At','Updated At']);
    expect(first).toHaveLength(2); expect(first[1][0]).toBe('1'); expect(first[1][3]).toBe(account.office);
    await top.fill('2');
    const second = await downloadRows(page, 'Export Priority Incidents CSV');
    expect(second).toHaveLength(3); expect(second[1][1]).toBe(first[1][1]); expect(second[2][0]).toBe('2');
    for (const row of second.slice(1)) { expect(row[3]).toBe(account.office); expect(['Reported','Under Review','In Progress']).toContain(row[2]); }
    expect(Number(second[1][4])).toBeGreaterThanOrEqual(Number(second[2][4]));
    const allPriority = await page.request.get('/api/admin/reports/priority-incidents.csv?top=200');
    expect(allPriority.ok()).toBe(true);
    const priorityRows = parseCsv(await allPriority.text());
    for (const id of fixture.ticketIds.slice(2)) expect(priorityRows.slice(1).some(row => row[1] === String(id))).toBe(false);

    await page.context().clearCookies();
    await loginAs(page, E2E_SYSTEM_ADMIN);
    await page.goto('/admin/activity-log?actionType=report_exported&targetType=export');
    await settleAdminPage(page, page.getByRole('heading', { name: 'Activity Log' }));
    for (const kind of ['submitted_reports','operational_assessments','priority_incidents']) {
      const event = page.getByRole('row').filter({ hasText: 'Report export' }).filter({ hasText: kind }).first();
      await expect(event).toBeVisible(); await expect(event).toContainText('Office: ' + account.office);
    }
    const response = await page.request.get('/api/admin/activity-log?actionType=report_exported&targetType=export&limit=100');
    const audit = await response.json() as { events: { details: { kind: string; office: string; top?: number } }[] };
    for (const kind of ['submitted_reports','operational_assessments','priority_incidents']) expect(audit.events.some(e => e.details.kind === kind && e.details.office === account.office)).toBe(true);
    expect(audit.events.some(e => e.details.kind === 'priority_incidents' && e.details.top === 2)).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(fixture.assessedConditions);
  });
}

test('invalid priority Top N shows the server message inline without a download', async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto('/admin/reports');
  await settleAdminPage(page, page.getByRole('heading', { name: 'Reports & Exports' }));
  await page.getByLabel('Top N', { exact: true }).fill('0');
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.getByRole('link', { name: 'Export Priority Incidents CSV', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Top N must be an integer from 1 to 200.' })).toBeVisible();
  expect(downloaded).toBe(false);
});

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
  // Category moved into the Filters popover with the queue rebuild.
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Pothole / Road Surface Damage" }).click();
  await page.keyboard.press("Escape");

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
  // The High Urgency Tickets tile was removed in manuscript revision Phase 1, step 6a.
  await expect(page.getByText("High Urgency Tickets", { exact: true })).toHaveCount(0);
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

// Batch 6 (five-role E2E reconciliation): Reports & Exports' office filter/
// city-wide summary and its underlying CSV endpoints were system_admin-only.
// Batch 1 of the five-role architecture removed system_admin's operational
// access entirely — both `/admin/reports` (renders access denied)
// and `GET /admin/reports/tickets.csv`/`work-orders.csv`
// (403 "Operational staff access required") now reject it outright. There is
// no reachable "city-wide export" capability left for any role to test.
test("system admin cannot reach Reports & Exports, and its CSV endpoints deny system admin directly", async ({ page, request }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/reports");
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Office", exact: true })).toHaveCount(0);

  const cookies = await page.context().cookies();
  const headers = sessionCookieHeader(cookies);
  const ticketsCsv = await request.get("/api/admin/reports/tickets.csv?status=all", { headers });
  expect(ticketsCsv.status()).toBe(403);
  const workOrdersCsv = await request.get("/api/admin/reports/work-orders.csv", { headers });
  expect(workOrdersCsv.status()).toBe(403);
});

test("ticket export URL on the reports page includes the selected filters", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/reports");
  await page.getByLabel("Ticket category", { exact: true }).click();
  await page.getByRole("option", { name: "Pothole / Road Surface Damage" }).click();

  const exportLink = page.getByRole("link", { name: "Export Tickets CSV" });
  await expect(exportLink).toHaveAttribute("href", /category=Pothole/);
  // The Hazard Urgency filter was removed (manuscript revision Phase 1, step 4).
  await expect(page.getByLabel("Ticket urgency", { exact: true })).toHaveCount(0);
  await expect(exportLink).not.toHaveAttribute("href", /urgency=/);
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

// Batch 6: the "system admin exports city-wide" test was removed — that
// capability no longer exists for any role (see the denial test above);
// "a hand-crafted ?office=MDRRMO ... never returns MDRRMO rows" above
// already covers the office-scoping half of what this test checked.

test("ticket export filters (status, category) narrow the CSV output", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
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
    "Cancelled At",
    "Cancellation Reason",
    "Replacement Work Order ID",
    "Created At",
    "Updated At",
  ]);
  const officeIndex = rows[0].indexOf("Assigned Office");
  for (const row of rows.slice(1)) expect(row[officeIndex]).toBe("MEO");
});

test("work order CSV export never includes a notes column", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const res = await request.get("/api/admin/reports/work-orders.csv", {
    headers: sessionCookieHeader(cookies),
  });
  const [header] = parseCsv(await res.text());
  expect(header.map((h) => h.toLowerCase())).not.toContain("notes");
});

test("work order CSV export never leaks a note body, even though the column itself is absent", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const headers = sessionCookieHeader(cookies);

  // Reuse an existing ticket rather than creating a new report — this test
  // only cares about the work order's notes field, not which ticket it's
  // attached to. Zero reports created (docs/testing.md §6). Since step 5b
  // the ticket must be active (no Work Order on a Rejected one) and carry
  // an Operational Assessment: the assessed MEO fixture ticket
  // e2e/global-setup.ts inserts, else the first active MEO ticket.
  const fixtureTicketId = process.env.E2E_GROUPING_FIXTURES
    ? (JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { assessmentWorkOrders?: { assessedTicketId: number } })
        .assessmentWorkOrders?.assessedTicketId
    : undefined;
  let ticketId = fixtureTicketId;
  if (ticketId === undefined) {
    const ticketsRes = await request.get("/api/admin/tickets?limit=1", { headers });
    const { tickets } = await ticketsRes.json();
    test.skip(tickets.length === 0, "no active tickets exist — run `pnpm --prefix api seed:diverse-reports` first");
    ticketId = tickets[0].id as number;
  }
  await ensureAssessment(request, ticketId, headers);

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
