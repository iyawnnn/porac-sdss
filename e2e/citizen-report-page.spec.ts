import { expect, test, type Page } from "@playwright/test";
import { E2E_CITIZEN_ACCOUNT, E2E_SECOND_CITIZEN_ACCOUNT } from "./test-credentials";
import { loginCitizen } from "./helpers";

// The citizen report page (manuscript revision Phase 6, step 6b): no staff
// names, referral agency and date (never the reason), the outcome in citizen
// words (neutral for a legacy Resolved ticket), "Back under review" without
// the reason, the merged banner, the ticket-level acknowledgment, and the
// owner-only tracking-reference search. Read-only, on tickets
// api/scripts/seed/seed-e2e-grouping-fixtures.ts inserts directly
// (citizen.reportPage) — no report is posted (docs/testing.md §6).

test.setTimeout(60_000);

interface ReportPageFixtures {
  staffNames: string[];
  staffOnlyText: string;
  referredReportId: number;
  returnedReportId: number;
  merged: { movedReportId: number; survivorReportId: number; survivorTrackingReference: string };
  acknowledgedReportId: number;
  resolvedMunicipalReportId: number;
  resolvedReferralReportId: number;
  resolvedLegacyReportId: number;
  ownTrackingReference: string;
}

function fixtures(): ReportPageFixtures {
  const parsed = process.env.E2E_GROUPING_FIXTURES
    ? (JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { citizen?: { reportPage?: ReportPageFixtures } }).citizen?.reportPage
    : undefined;
  if (!parsed) throw new Error("Missing the citizen report page fixtures e2e/global-setup.ts inserts (E2E_GROUPING_FIXTURES.citizen.reportPage).");
  return parsed;
}

function timeline(page: Page) {
  return page.getByRole("list", { name: "Report timeline" });
}

async function openReport(page: Page, reportId: number) {
  await page.goto(`/dashboard/reports/${reportId}`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(timeline(page).getByText("Report submitted")).toBeVisible();
}

// No staff name, no staff-only sentinel text, no raw outcome code.
async function expectNothingInternal(page: Page) {
  const f = fixtures();
  const text = await page.locator("main").innerText();
  for (const name of f.staffNames) expect(text).not.toContain(name);
  expect(text).not.toContain(f.staffOnlyText);
  expect(text).not.toMatch(/MUNICIPAL_ACTION_COMPLETED|EXTERNAL_REFERRAL/);
}

test.describe("Citizen report page (step 6b)", () => {
  test.beforeEach(async ({ page }) => {
    await loginCitizen(page, E2E_CITIZEN_ACCOUNT);
  });

  test("the timeline shows no staff name on any step", async ({ page }) => {
    const f = fixtures();
    for (const id of [
      f.referredReportId,
      f.returnedReportId,
      f.merged.movedReportId,
      f.acknowledgedReportId,
      f.resolvedMunicipalReportId,
      f.resolvedReferralReportId,
      f.resolvedLegacyReportId,
    ]) {
      await openReport(page, id);
      await expectNothingInternal(page);
      // Every step's meta line is a date only.
      for (const meta of await timeline(page).locator("li p.font-mono").allInnerTexts()) {
        expect(meta).not.toContain("·");
      }
    }
  });

  test("referrals show the agency and the date, never the reason", async ({ page }) => {
    const f = fixtures();
    await openReport(page, f.referredReportId);
    const referred = timeline(page).locator('li[data-kind="referred"]');
    await expect(referred).toHaveCount(2);
    await expect(referred.nth(0)).toContainText("Referred to DPWH");
    await expect(referred.nth(1)).toContainText("Referred to an outside agency");
    for (const item of await referred.all()) {
      await expect(item.locator("p.font-mono")).toHaveText(/\d{4}/);
    }
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("Porac Water District");
    await expectNothingInternal(page);
  });

  test("a return to Under Review shows as a generic step, without the reason or the earlier resolution", async ({ page }) => {
    const f = fixtures();
    await openReport(page, f.returnedReportId);
    await expect(timeline(page).getByText("Back under review", { exact: true })).toHaveCount(1);
    await expect(timeline(page).getByText("Resolved", { exact: true })).toHaveCount(1);
    await expect(timeline(page).getByText("Referred to Water utility provider")).toBeVisible();
    await expect(page.getByText("Case Closure Summary")).toHaveCount(0);
    await expect(page.locator('[data-status="Under Review"]').first()).toBeVisible();
    await expectNothingInternal(page);
  });

  test("the outcome reads in citizen words for each outcome, and a legacy Resolved ticket stays neutral", async ({ page }) => {
    const f = fixtures();

    await openReport(page, f.resolvedMunicipalReportId);
    const municipal = page.getByTestId("citizen-outcome");
    await expect(municipal).toContainText("Handled by the municipality");
    await expect(municipal).not.toContainText("The agency may not have resolved the issue yet.");

    await openReport(page, f.resolvedReferralReportId);
    const referral = page.getByTestId("citizen-outcome");
    await expect(referral).toContainText("Referred to an outside agency");
    await expect(referral).toContainText("The municipality's handling is complete. The agency may not have resolved the issue yet.");
    await expect(timeline(page).getByText("Referred to Electric utility provider")).toBeVisible();

    await openReport(page, f.resolvedLegacyReportId);
    await expect(page.getByText("Case Closure Summary")).toBeVisible();
    await expect(page.getByTestId("citizen-outcome")).toHaveCount(0);
    const legacyText = await page.locator("main").innerText();
    expect(legacyText).not.toContain("Handled by the municipality");
    expect(legacyText).not.toContain("Referred to an outside agency");
    await expectNothingInternal(page);
  });

  test("a merged report shows the banner and the old ticket's acknowledgment, never the other citizen's reference", async ({ page, browser }) => {
    const f = fixtures();
    await openReport(page, f.merged.movedReportId);
    await expect(page.getByText("Merged with an existing issue").first()).toBeVisible();
    await expect(page.getByText("Now tracked together with 1 other report.").first()).toBeVisible();
    await expect(timeline(page).getByText("Acknowledged by municipal monitoring")).toBeVisible();
    expect(await page.locator("main").innerText()).not.toContain(f.merged.survivorTrackingReference);
    await expectNothingInternal(page);

    // The survivor's own reporter is not told their report was merged.
    const context = await browser.newContext();
    const other = await context.newPage();
    await loginCitizen(other, E2E_SECOND_CITIZEN_ACCOUNT);
    await openReport(other, f.merged.survivorReportId);
    await expect(other.getByText("Other residents reported this issue too")).toBeVisible();
    await expect(other.getByText("Now tracked together with 1 other report.").first()).toBeVisible();
    await expect(other.getByText("Merged with an existing issue")).toHaveCount(0);
    expect(await other.locator("main").innerText()).not.toContain(f.ownTrackingReference);
    await context.close();
  });

  test("the ticket-level acknowledgment shows without the remark or the staff name", async ({ page }) => {
    const f = fixtures();
    await openReport(page, f.acknowledgedReportId);
    await expect(timeline(page).getByText("Acknowledged by municipal monitoring")).toBeVisible();
    await expectNothingInternal(page);
  });

  test("the reference search finds your own report and says the same 'not found' for anyone else's or a missing one", async ({ page }) => {
    const f = fixtures();
    await page.goto("/reports");
    const search = page.getByRole("search", { name: "Find a report by tracking reference" });
    const input = search.getByLabel("Find a report by tracking reference");

    await input.fill(f.ownTrackingReference.toLowerCase());
    await search.getByRole("button", { name: "Find report" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/reports/${f.referredReportId}$`));

    await page.goto("/reports");
    for (const ref of [f.merged.survivorTrackingReference, "PRC-2099-999999"]) {
      await input.fill(ref);
      await search.getByRole("button", { name: "Find report" }).click();
      await expect(search.getByText("No report found with that reference.")).toBeVisible();
      await expect(page).toHaveURL(/\/reports$/);
    }

    // The API itself: another citizen's reference and a missing one get the
    // identical answer.
    const notMine = await page.request.get(`/api/reports/mine/by-reference/${f.merged.survivorTrackingReference}`);
    const missing = await page.request.get("/api/reports/mine/by-reference/PRC-2099-999999");
    expect(notMine.status()).toBe(404);
    expect(missing.status()).toBe(404);
    expect(await notMine.text()).toBe(await missing.text());
    const mine = await page.request.get(`/api/reports/mine/by-reference/${f.ownTrackingReference}`);
    expect(await mine.json()).toEqual({ id: f.referredReportId });
  });
});

// IAN-28: no horizontal scroll at phone widths, even with a long unbroken
// title (the citizen controls it, up to 200 characters).
test("dashboard and report detail fit a 360px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await loginCitizen(page, E2E_CITIZEN_ACCOUNT);
  const fitsViewport = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Recent Activity" })).toBeVisible();
  expect(await fitsViewport()).toBe(true);
  await openReport(page, fixtures().acknowledgedReportId);
  expect(await fitsViewport()).toBe(true);
  await page.getByRole("heading", { level: 1 }).evaluate((h) => { h.textContent = "Flooded" + "X".repeat(190); });
  expect(await fitsViewport()).toBe(true);
});
