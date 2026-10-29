import { expect, test } from "@playwright/test";
import { E2E_CITIZEN_ACCOUNT, E2E_MEO_ADMIN, E2E_SECOND_CITIZEN_ACCOUNT } from "./test-credentials";
import { loginAdmin, loginCitizen, settleAdminPage } from "./helpers";

// Per-citizen resolution feedback (manuscript revision Phase 3, step 3g;
// Appendix H RESOLUTION_FEEDBACK). Posts no report: the Resolved ticket, with
// one report by citizen1 and one by citizen2, comes from
// api/scripts/seed/seed-e2e-grouping-fixtures.ts (its feedback fixture),
// which e2e/global-setup.ts runs and e2e/global-teardown.ts retires as
// Rejected (a full run already posts 20 reports, the per-IP hourly limit;
// docs/testing.md). Serial, because each test builds on the answers before
// it (--workers=1).

test.setTimeout(60_000);

interface FeedbackFixture {
  ticketId: number;
  citizenAReportId: number;
  citizenBReportId: number;
}

const fixture: FeedbackFixture | null = process.env.E2E_GROUPING_FIXTURES
  ? ((JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { feedback?: FeedbackFixture }).feedback ?? null)
  : null;

const REASON = "E2E: the pothole opened up again after the rain.";

test.describe.serial("Per-citizen resolution feedback", () => {
  test.skip(!fixture, "needs the fixtures e2e/global-setup.ts inserts");

  test("citizen A confirms and sees the locked answer, which survives a reload and can't be given twice", async ({ page }) => {
    const { citizenAReportId } = fixture!;
    await loginCitizen(page, E2E_CITIZEN_ACCOUNT);
    await page.goto(`/dashboard/reports/${citizenAReportId}`);

    await expect(page.getByText("Resolution Feedback")).toBeVisible();
    await page.getByRole("button", { name: "Confirm Fixed" }).click();

    const locked = page.getByTestId("resolution-feedback-locked");
    await expect(locked).toContainText("Thanks for confirming");
    await expect(locked).toContainText("Your answer can't be changed.");
    await expect(page.getByRole("button", { name: "Confirm Fixed" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Report Still Not Fixed" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("resolution-feedback-locked")).toContainText("Thanks for confirming");
    await expect(page.getByText("You confirmed this issue was fixed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Report Still Not Fixed" })).toHaveCount(0);

    // A second answer by the same citizen is refused and changes nothing.
    const again = await page.request.post(`/api/reports/mine/${citizenAReportId}/dispute`, {
      data: { reason: "Changed my mind." },
    });
    expect(again.status()).toBe(409);
  });

  test("citizen B on the same ticket can still answer, sees only their own answer, and disputes", async ({ page }) => {
    const { citizenBReportId } = fixture!;
    await loginCitizen(page, E2E_SECOND_CITIZEN_ACCOUNT);
    await page.goto(`/dashboard/reports/${citizenBReportId}`);

    // Citizen A's confirmation neither locks nor shows here.
    await expect(page.getByRole("button", { name: "Confirm Fixed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Report Still Not Fixed" })).toBeVisible();
    await expect(page.getByTestId("resolution-feedback-locked")).toHaveCount(0);
    await expect(page.getByText("Thanks for confirming")).toHaveCount(0);
    await expect(page.getByText("You confirmed this issue was fixed.")).toHaveCount(0);

    await page.getByRole("button", { name: "Report Still Not Fixed" }).click();
    await page.getByLabel("What's still wrong?").fill(REASON);
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByTestId("resolution-feedback-locked")).toContainText(
      "You reported that this issue isn't actually fixed."
    );

    await page.reload();
    await expect(page.getByTestId("resolution-feedback-locked")).toContainText(
      "You reported that this issue isn't actually fixed."
    );
    // No count of other answers, and the dispute reason stays with the office.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(REASON);
    expect(bodyText).not.toMatch(/\d+ confirmed/);

    // The citizen API returns this citizen's own answer only.
    const detail = await page.request.get(`/api/reports/mine/${citizenBReportId}`);
    expect(detail.ok()).toBe(true);
    const { report } = (await detail.json()) as { report: Record<string, unknown> };
    expect(report.my_feedback).toMatchObject({ feedback_type: "DISPUTED", reason: REASON });
    expect(report).not.toHaveProperty("disputed_at");
    expect(report).not.toHaveProperty("resolution_confirmed_at");

    const again = await page.request.post(`/api/reports/mine/${citizenBReportId}/confirm-resolution`);
    expect(again.status()).toBe(409);
  });

  test("staff Ticket Detail shows both answers in the Citizen feedback block", async ({ page }) => {
    const { ticketId } = fixture!;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    const block = page.getByTestId("citizen-feedback");
    await settleAdminPage(page, block);

    await expect(page.getByTestId("citizen-feedback-summary")).toHaveText("1 confirmed, 1 disputed");
    const responses = block.getByTestId("citizen-feedback-response");
    await expect(responses).toHaveCount(2);
    await expect(responses.nth(0)).toContainText("Confirmed fixed");
    await expect(responses.nth(1)).toContainText("Disputed");
    await expect(responses.nth(1)).toContainText(REASON);

    // The ticket-level flag the first dispute set still drives the red card.
    await expect(page.getByText("Citizen reports issue not fixed")).toBeVisible();
  });
});
