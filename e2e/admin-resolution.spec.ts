import { expect, test, type Page } from "@playwright/test";
import { E2E_CITIZEN_ACCOUNT, E2E_FOCAL_ADMIN, E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin, loginCitizen, settleAdminPage } from "./helpers";

// Resolution outcome and return to Under Review (manuscript revision Phase
// 5, step 5c; migration 0046): resolving needs an outcome and resolution
// notes; External referral needs a recorded referral; an active Work Order
// blocks resolving; only a ticket resolved by External referral returns to
// Under Review, with a staff-only reason, and the earlier referral and
// resolution stay in the timeline; Focal is refused; a legacy Resolved
// ticket shows "Not recorded (legacy)" and offers no return. Posts no
// report: the tickets come from api/scripts/seed/seed-e2e-grouping-fixtures.ts
// (its resolution fixtures), which e2e/global-setup.ts runs and
// e2e/global-teardown.ts retires as Rejected (docs/testing.md). Serial
// (--workers=1): the fixtures change as it runs.

test.setTimeout(60_000);

interface ResolutionFixtures {
  inputTicketId: number;
  workOrderTicketId: number;
  referredTicketId: number;
  referredReportId: number;
  referralAgency: string;
  legacyTicketId: number;
}

const fixtures: ResolutionFixtures | null = process.env.E2E_GROUPING_FIXTURES
  ? ((JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { resolution?: ResolutionFixtures }).resolution ?? null)
  : null;

const RETURN_REASON = "E2E: the water district says the main line is not theirs.";

async function message(res: { json(): Promise<unknown> }): Promise<string> {
  return ((await res.json()) as { message: string }).message;
}

async function expectResolveRefusal(page: Page, ticketId: number, multipart: Record<string, string>, status: number, text: string) {
  const res = await page.request.post(`/api/admin/tickets/${ticketId}/status`, { multipart });
  expect(res.status()).toBe(status);
  expect(await message(res)).toBe(text);
}

async function expectReturnRefusal(page: Page, ticketId: number, reason: string, status: number, text: string) {
  const res = await page.request.post(`/api/admin/tickets/${ticketId}/return-to-review`, { data: { reason } });
  expect(res.status()).toBe(status);
  expect(await message(res)).toBe(text);
}

async function openTicket(page: Page, ticketId: number) {
  await page.goto(`/admin/tickets/${ticketId}`);
  await settleAdminPage(page, page.getByRole("heading", { level: 1 }));
}

async function openResolveDialog(page: Page) {
  await page.getByRole("button", { name: "Advance to Resolved" }).click();
  const dialog = page.getByRole("dialog", { name: "Mark ticket resolved" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe.serial("Resolution outcome and return to Under Review", () => {
  test.skip(!fixtures, "needs the fixtures e2e/global-setup.ts inserts");

  test("resolving needs an outcome and notes, and External referral needs a referral", async ({ page }) => {
    const { inputTicketId: id } = fixtures!;
    await loginAdmin(page, E2E_MEO_ADMIN);

    await expectResolveRefusal(page, id, { notes: "E2E: patched" }, 400, "An outcome is required to resolve a ticket: MUNICIPAL_ACTION_COMPLETED or EXTERNAL_REFERRAL.");
    await expectResolveRefusal(page, id, { outcome: "MUNICIPAL_ACTION_COMPLETED", notes: "   " }, 400, "Resolution notes are required to resolve a ticket.");
    await expectResolveRefusal(
      page,
      id,
      { outcome: "EXTERNAL_REFERRAL", notes: "E2E: referred" },
      409,
      `Ticket #${id} has no recorded referral. Refer it to an external agency first, or resolve it as Municipal action completed.`,
    );

    // The dialog: its own required-field errors, then the API's 409 shown
    // inline, then a Municipal action completed resolution.
    await openTicket(page, id);
    const dialog = await openResolveDialog(page);
    await dialog.getByRole("button", { name: "Mark resolved" }).click();
    await expect(dialog.getByText("Choose an outcome.")).toBeVisible();
    await expect(dialog.getByText("Resolution notes are required.")).toBeVisible();
    await dialog.getByRole("radio", { name: /External referral/ }).check();
    await dialog.getByLabel("Resolution notes (shown to the citizen)").fill("E2E: referred to the water district.");
    await dialog.getByRole("button", { name: "Mark resolved" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      `Ticket #${id} has no recorded referral. Refer it to an external agency first, or resolve it as Municipal action completed.`,
    );
    await dialog.getByRole("radio", { name: /Municipal action completed/ }).check();
    await dialog.getByLabel("Resolution notes (shown to the citizen)").fill("E2E: pothole patched by the field crew.");
    await dialog.getByRole("button", { name: "Mark resolved" }).click();
    await expect(dialog).toHaveCount(0);

    const header = page.locator("h1").locator("..");
    await expect(header.getByText("Resolved", { exact: true })).toBeVisible();
    await expect(page.getByTestId("resolution-outcome")).toHaveText("Outcome: Municipal action completed");
    await expect(page.getByTestId("resolution-card").getByText("E2E: pothole patched by the field crew.")).toBeVisible();
    // Only an External referral resolution can return.
    await expect(page.getByRole("button", { name: "Return to Under Review" })).toHaveCount(0);
    await expectReturnRefusal(
      page,
      id,
      RETURN_REASON,
      409,
      `Ticket #${id} was resolved as Municipal action completed; only a ticket resolved by External referral can be returned to Under Review.`,
    );
  });

  test("resolving is refused while a Work Order is active, and the dialog shows why", async ({ page }) => {
    const { workOrderTicketId: id } = fixtures!;
    const refusal = `Ticket #${id} has 1 active Work Order. Complete or cancel it before resolving the ticket.`;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await expectResolveRefusal(page, id, { outcome: "MUNICIPAL_ACTION_COMPLETED", notes: "E2E: patched" }, 409, refusal);

    await openTicket(page, id);
    const dialog = await openResolveDialog(page);
    await dialog.getByRole("radio", { name: /Municipal action completed/ }).check();
    await dialog.getByLabel("Resolution notes (shown to the citizen)").fill("E2E: patched");
    await dialog.getByRole("button", { name: "Mark resolved" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(refusal);
  });

  test("Focal Personnel can neither resolve nor return a ticket", async ({ page }) => {
    const { referredTicketId: id } = fixtures!;
    await loginAdmin(page, E2E_FOCAL_ADMIN);
    const resolve = await page.request.post(`/api/admin/tickets/${id}/status`, {
      multipart: { outcome: "EXTERNAL_REFERRAL", notes: "E2E: Focal tries" },
    });
    expect(resolve.status()).toBe(403);
    const giveBack = await page.request.post(`/api/admin/tickets/${id}/return-to-review`, { data: { reason: "E2E: Focal tries" } });
    expect(giveBack.status()).toBe(403);
  });

  test("resolve by External referral, return to Under Review with a reason, and resolve again: the history keeps the referral, the resolution and the return", async ({
    page,
    browser,
  }) => {
    const { referredTicketId: id, referredReportId, referralAgency } = fixtures!;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await openTicket(page, id);

    const dialog = await openResolveDialog(page);
    await dialog.getByRole("radio", { name: /External referral/ }).check();
    await dialog.getByLabel("Resolution notes (shown to the citizen)").fill("E2E: referred to the water district for the main line.");
    await dialog.getByRole("button", { name: "Mark resolved" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("resolution-outcome")).toHaveText("Outcome: External referral");

    // A reason is required.
    await expectReturnRefusal(page, id, "   ", 400, "A reason is required to return a ticket to Under Review.");
    const returnButton = page.getByRole("button", { name: "Return to Under Review" });
    await expect(returnButton).toBeDisabled();
    await expect(page.getByText("The earlier referral and the earlier resolution stay in the timeline.", { exact: false })).toBeVisible();
    await page.getByLabel("Reason for returning to Under Review").fill(RETURN_REASON);
    await returnButton.click();

    const header = page.locator("h1").locator("..");
    await expect(header.getByText("Under Review", { exact: true })).toBeVisible();
    await expect(page.getByTestId("resolution-outcome")).toHaveCount(0);
    // The tracker is back at Under Review: the next step is In Progress.
    await expect(page.getByRole("button", { name: "Advance to In Progress" })).toBeVisible();

    await page.getByRole("tab", { name: "Timeline" }).click();
    await expect(page.getByText("Resolved — External referral: E2E: referred to the water district for the main line.")).toBeVisible();
    await expect(page.getByText(`Returned to Under Review: ${RETURN_REASON}. Latest referral: ${referralAgency}`, { exact: false })).toBeVisible();
    await expect(page.getByText(`Referral recorded — ${referralAgency}: E2E resolution fixture: water supply line`)).toBeVisible();

    // The citizen sees the status change, never the staff-only reason.
    const citizenContext = await browser.newContext();
    const citizenPage = await citizenContext.newPage();
    await loginCitizen(citizenPage, E2E_CITIZEN_ACCOUNT);
    await citizenPage.goto(`/dashboard/reports/${referredReportId}`);
    await expect(citizenPage.getByRole("heading", { name: "Timeline" })).toBeVisible();
    await expect(citizenPage.getByText(RETURN_REASON, { exact: false })).toHaveCount(0);
    await citizenContext.close();

    // Resolved again, as Municipal action completed.
    for (const multipart of [{ notes: "E2E: next step" } as Record<string, string>, { outcome: "MUNICIPAL_ACTION_COMPLETED", notes: "E2E: the office repaired the line itself." }]) {
      const res = await page.request.post(`/api/admin/tickets/${id}/status`, { multipart });
      expect(res.ok()).toBe(true);
    }
    await openTicket(page, id);
    await expect(page.getByTestId("resolution-outcome")).toHaveText("Outcome: Municipal action completed");
    await page.getByRole("tab", { name: "Timeline" }).click();
    await expect(page.getByText("Resolved — External referral: E2E: referred to the water district for the main line.")).toBeVisible();
    await expect(page.getByText(`Returned to Under Review: ${RETURN_REASON}`, { exact: false })).toBeVisible();
    await expect(page.getByText("Resolved — Municipal action completed: E2E: the office repaired the line itself.")).toBeVisible();
  });

  test("a legacy Resolved ticket shows Not recorded (legacy) and offers no return", async ({ page }) => {
    const { legacyTicketId: id } = fixtures!;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await openTicket(page, id);
    await expect(page.getByTestId("resolution-outcome")).toHaveText("Outcome: Not recorded (legacy)");
    await expect(page.getByTestId("resolution-card").getByText("Not recorded (legacy)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Return to Under Review" })).toHaveCount(0);
    await expectReturnRefusal(
      page,
      id,
      RETURN_REASON,
      409,
      `Ticket #${id} was resolved before outcomes were recorded (legacy) and can't be returned to Under Review.`,
    );
  });
});
