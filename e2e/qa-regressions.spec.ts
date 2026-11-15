import { expect, test, type Page } from "@playwright/test";
import { E2E_MDRRMO_ADMIN, E2E_MEO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { ensureAssessment, loginAdmin, settleAdminPage } from "./helpers";

// Regression locks for the QA stabilization fixes (Q-01..Q-31). Posts no
// report and creates no account: tickets come from the fixtures
// e2e/global-setup.ts inserts, and every account request below is refused
// with 400/409. Serial (--workers=1): the reject test changes a fixture.

test.setTimeout(60_000);

interface Fixtures {
  assessmentWorkOrders: { noAssessmentTicketId: number };
  tickets: { sharedReadOnly: { ticketId: number } };
}

const fixtures: Fixtures | null = process.env.E2E_GROUPING_FIXTURES
  ? (() => {
      const parsed = JSON.parse(process.env.E2E_GROUPING_FIXTURES) as Partial<Fixtures>;
      return parsed.assessmentWorkOrders && parsed.tickets ? (parsed as Fixtures) : null;
    })()
  : null;

async function message(res: { json(): Promise<unknown> }): Promise<string> {
  return ((await res.json()) as { message: string }).message;
}

async function ticketStatus(page: Page, ticketId: number): Promise<string> {
  const res = await page.request.get(`/api/admin/tickets/${ticketId}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { ticket: { status: string } }).ticket.status;
}

test.describe.serial("QA regressions", () => {
  test.skip(!fixtures, "needs the fixtures e2e/global-setup.ts inserts");

  // noAssessmentTicketId is only read by the first test of
  // admin-assessment-work-orders.spec.ts, which runs earlier (file order)
  // and leaves it without an assessment; teardown retires it as Rejected.
  test("Q-02 / Q-01 / Q-31: reject is refused while a Work Order is active, works after cancelling it, and a second reject is a 409", async ({ page }) => {
    const ticketId = fixtures!.assessmentWorkOrders.noAssessmentTicketId;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await ensureAssessment(page.request, ticketId);
    const created = await page.request.post("/api/admin/work-orders", { data: { ticketId, title: `E2E Q-02 ${Date.now()}` } });
    expect(created.ok()).toBe(true);
    const workOrderId = ((await created.json()) as { id: number }).id;

    const blocked = await page.request.post(`/api/admin/tickets/${ticketId}/reject`, { data: { reason: "E2E: Q-02 blocked" } });
    expect(blocked.status()).toBe(409);
    expect(await message(blocked)).toMatch(/active Work Order/);
    expect(await ticketStatus(page, ticketId)).toBe("Under Review");

    const cancel = await page.request.post(`/api/admin/work-orders/${workOrderId}/cancel`, { data: { reason: "E2E: Q-02 cancelled" } });
    expect(cancel.ok()).toBe(true);
    const rejected = await page.request.post(`/api/admin/tickets/${ticketId}/reject`, { data: { reason: "E2E: Q-02 rejected" } });
    expect(rejected.ok()).toBe(true);
    expect(await ticketStatus(page, ticketId)).toBe("Rejected");

    const again = await page.request.post(`/api/admin/tickets/${ticketId}/reject`, { data: { reason: "E2E: Q-01 again" } });
    expect(again.status()).toBe(409);
    expect(await message(again)).toBe("Ticket is already Rejected and cannot be rejected.");
  });

  test("Q-12: searching the ticket queue by a report's tracking reference finds its ticket", async ({ page }) => {
    const { ticketId } = fixtures!.tickets.sharedReadOnly;
    await loginAdmin(page, E2E_MEO_ADMIN);
    const detail = await page.request.get(`/api/admin/tickets/${ticketId}`);
    expect(detail.ok()).toBe(true);
    const reference = ((await detail.json()) as { reports: { tracking_reference: string }[] }).reports[0].tracking_reference;

    await page.goto("/admin/tickets?status=all");
    const search = page.getByLabel("Search tickets");
    await settleAdminPage(page, search);
    await search.fill(reference);
    await expect(page.getByRole("link", { name: `Open ticket ${ticketId}`, exact: true })).toBeVisible();
  });

  for (const [name, account] of [["MEO", E2E_MEO_ADMIN], ["MDRRMO", E2E_MDRRMO_ADMIN]] as const) {
    test(`Q-05: ${name} can export the submitted-reports and flagged CSVs`, async ({ page }) => {
      await loginAdmin(page, account);
      for (const [path, firstHeader] of [
        ["submitted-reports.csv", "Tracking Reference"],
        ["flagged.csv", "Report ID"],
      ] as const) {
        const res = await page.request.get(`/api/admin/reports/${path}`);
        expect(res.status()).toBe(200);
        expect(res.headers()["content-type"]).toContain("text/csv");
        expect((await res.text()).split(/\r?\n/)[0]).toContain(firstHeader);
      }
    });
  }

  test("Q-07: malformed int4 inputs are 400, not 500", async ({ page }) => {
    await loginAdmin(page, E2E_MEO_ADMIN);
    expect((await page.request.get("/api/admin/tickets/99999999999999999999")).status()).toBe(400);
    expect((await page.request.get("/api/admin/tickets?barangayId=abc")).status()).toBe(400);
  });

  test("Q-06: a report cannot be marked a duplicate of itself", async ({ page }) => {
    const { ticketId } = fixtures!.tickets.sharedReadOnly;
    await loginAdmin(page, E2E_MEO_ADMIN);
    const detail = await page.request.get(`/api/admin/tickets/${ticketId}`);
    const reportId = ((await detail.json()) as { reports: { id: number }[] }).reports[0].id;

    const res = await page.request.post(`/api/admin/reports/${reportId}/moderate`, {
      data: { action: "duplicate", canonicalReportId: reportId },
    });
    expect(res.status()).toBe(400);
    expect(await message(res)).toBe("A report cannot be marked as a duplicate of itself.");
  });

  test("Q-09: creating an admin validates the email and rejects a case-variant duplicate", async ({ page }) => {
    await loginAdmin(page, E2E_SYSTEM_ADMIN);
    const valid = { password: "longenoughpassword", firstName: "E2E", lastName: "Refused", accountType: "PERSONNEL", isFocal: false, office: "MEO" };

    const invalid = await page.request.post("/api/admin/admins", { data: { ...valid, email: "not-an-email" } });
    expect(invalid.status()).toBe(400);

    const duplicate = await page.request.post("/api/admin/admins", { data: { ...valid, email: E2E_MEO_ADMIN.email.toUpperCase() } });
    expect(duplicate.status()).toBe(409);
  });
});
