import { expect, test } from "@playwright/test";
import { E2E_CITIZEN_ACCOUNT, E2E_FOCAL_ADMIN, E2E_MDRRMO_ADMIN, E2E_MEO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin, loginCitizen, settleAdminPage } from "./helpers";

// Focal severity screening (manuscript revision Phase 3, step 3f; Appendix
// H REPORTS severity_screening_*, Table 2). Posts no report: the ticket
// comes from api/scripts/seed/seed-e2e-grouping-fixtures.ts (its screening
// fixture, whose report carries one old general 'screened' intake action),
// which e2e/global-setup.ts runs and e2e/global-teardown.ts retires (a full
// run already posts 20 reports, the per-IP hourly limit; docs/testing.md).
// Serial, because the later tests read the first test's screening
// (--workers=1).

test.setTimeout(60_000);

interface FixtureTicket {
  ticketId: number;
  reportId: number;
}

const fixture: FixtureTicket | null = process.env.E2E_GROUPING_FIXTURES
  ? ((JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { screening?: FixtureTicket }).screening ?? null)
  : null;

const REMARKS = "E2E: the photo shows a shallow pothole; check on site.";

test.describe.serial("Focal severity screening", () => {
  test.skip(!fixture, "needs the fixtures e2e/global-setup.ts inserts");

  test("Focal screens a report \"Requires operational validation\" with remarks; intake shows Screened and the citizen's severity is unchanged", async ({ page }) => {
    const { reportId } = fixture!;
    await loginAdmin(page, E2E_FOCAL_ADMIN);
    await page.goto(`/admin/focal/intake/${reportId}`);
    const card = page.getByTestId("severity-screening");
    await settleAdminPage(page, card);

    // The old general screening is history: no button, and the old action
    // gives no Screened state.
    await expect(page.getByRole("button", { name: "Initial Screening" })).toHaveCount(0);
    await expect(page.getByText(/Initial screening completed/)).toBeVisible();
    await expect(page.getByTestId("severity-screening-current")).toHaveText("Not reviewed");
    await expect(page.getByText("Screened", { exact: true })).toHaveCount(0);
    await expect(card.getByText("Citizen severity: Medium")).toBeVisible();
    await expect(card.getByText("Screening is advisory; it does not change the citizen's severity or Operational Priority.")).toBeVisible();

    const save = card.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled(); // a choice is required
    await card.getByRole("radio", { name: "Requires operational validation" }).check();
    await card.getByLabel("Remarks (optional)").fill(REMARKS);
    await save.click();

    const current = page.getByTestId("severity-screening-current");
    await expect(current).toContainText("Requires operational validation");
    await expect(current).toContainText(`“${REMARKS}”`);
    await expect(current).toContainText(`${E2E_FOCAL_ADMIN.firstName} ${E2E_FOCAL_ADMIN.lastName}`);
    await expect(page.getByText("Screened", { exact: true }).first()).toBeVisible();
    await expect(card.getByText("Citizen severity: Medium")).toBeVisible();
    await expect(page.getByText("Citizen severity: Medium").first()).toBeVisible();

    // The Intake Queue shows the same state.
    const intake = await page.request.get("/api/admin/intake");
    expect(intake.ok()).toBe(true);
    const rows: { reportId: number; reportReference: string; intakeState: string; citizenSeverity: string }[] = await intake.json();
    const row = rows.find((r) => r.reportId === reportId);
    expect(row).toMatchObject({ intakeState: "Screened", citizenSeverity: "Medium" });
    await page.goto("/admin/focal/intake");
    const queueRow = page.getByRole("row").filter({ hasText: row!.reportReference });
    await settleAdminPage(page, queueRow);
    await expect(queueRow).toContainText("Screened");
  });

  test("MEO sees the Focal screening line on Ticket Detail, with the citizen's severity unchanged", async ({ page }) => {
    const { ticketId, reportId } = fixture!;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    const reportCard = page.getByTestId(`report-card-${reportId}`);
    await settleAdminPage(page, reportCard);

    await expect(page.getByTestId(`report-screening-${reportId}`)).toHaveText(
      `Focal screening: Requires operational validation — “${REMARKS}”`,
    );
    await expect(reportCard.getByText("Medium", { exact: true })).toBeVisible();
  });

  test("MEO, MDRRMO and the System Administrator get 403 from the screening action", async ({ browser }) => {
    for (const admin of [E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginAdmin(page, admin);
      const res = await page.request.post(`/api/admin/intake/${fixture!.reportId}/severity-screening`, {
        data: { status: "NO_CONCERN_NOTED" },
      });
      expect([admin.email, res.status()]).toEqual([admin.email, 403]);
      await context.close();
    }
  });

  test("the citizen's own report API and page carry no screening field", async ({ page }) => {
    const { reportId } = fixture!;
    // Every key at any depth (the fixture's title itself says "screening",
    // so the check is on field names and the remarks, not on raw text).
    const keys = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap(keys)
        : value && typeof value === "object"
          ? Object.entries(value).flatMap(([key, v]) => [key, ...keys(v)])
          : [];

    await loginCitizen(page, E2E_CITIZEN_ACCOUNT);
    const res = await page.request.get(`/api/reports/mine/${reportId}`);
    expect(res.ok()).toBe(true);
    const detail = await res.json();
    expect(keys(detail).filter((key) => /screen/i.test(key))).toEqual([]);
    expect(JSON.stringify(detail)).not.toContain(REMARKS);
    expect(JSON.stringify(detail)).not.toContain("REQUIRES_OPERATIONAL_VALIDATION");
    const list = await page.request.get("/api/reports/mine");
    expect(list.ok()).toBe(true);
    const rows = await list.json();
    expect(rows.some((r: { id: number }) => r.id === reportId)).toBe(true);
    expect(keys(rows).filter((key) => /screen/i.test(key))).toEqual([]);

    await page.goto(`/dashboard/reports/${reportId}`);
    await expect(page.getByText("E2E correction fixture: severity screening").first()).toBeVisible();
    await expect(page.getByText(/Focal screening|Requires operational validation/)).toHaveCount(0);
    await expect(page.getByText(REMARKS)).toHaveCount(0);
  });
});
