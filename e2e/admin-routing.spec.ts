import { expect, test, type Page } from "@playwright/test";
import { E2E_FOCAL_ADMIN, E2E_MDRRMO_ADMIN, E2E_MEO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin, settleAdminPage } from "./helpers";

// Manual routing (manuscript pp. 43–44, Appendix H ROUTING_ACTIONS;
// manuscript revision Phase 5, step 5a): Reassign and Refer only, each with
// a required reason; Focal only while the ticket is Reported with no active
// Work Order; nobody on a Rejected ticket or while a Work Order is active.
// Forward and Escalate are gone. Posts no report: the tickets come from
// api/scripts/seed/seed-e2e-grouping-fixtures.ts (its routing fixtures),
// which e2e/global-setup.ts runs and e2e/global-teardown.ts retires as
// Rejected (a full run already posts 20 reports, the per-IP hourly limit;
// docs/testing.md). Serial (--workers=1): the fixtures change as it runs.

test.setTimeout(60_000);

interface FixtureTicket {
  ticketId: number;
  reportId: number;
}
interface RoutingFixtures {
  focalReported: FixtureTicket;
  focalUnderReview: FixtureTicket;
  focalWorkOrder: FixtureTicket;
  meoReferral: FixtureTicket;
  meoWorkOrder: FixtureTicket;
  rejected: FixtureTicket;
}

const fixtures: RoutingFixtures | null = process.env.E2E_GROUPING_FIXTURES
  ? ((JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { routing?: RoutingFixtures }).routing ?? null)
  : null;

const focalBlockedNotReported = (ticketId: number, status: string) =>
  `Focal Personnel can only reassign or refer a ticket while it is still Reported; Ticket #${ticketId} is ${status}. The responsible office handles routing from here.`;
const focalBlockedByWorkOrder = (ticketId: number) =>
  `Focal Personnel can only reassign or refer a ticket before work starts; Ticket #${ticketId} has an active Work Order. The responsible office handles routing from here.`;

async function expectRefusal(page: Page, path: string, data: Record<string, unknown>, status: number, message: string) {
  const res = await page.request.post(path, { data });
  expect(res.status()).toBe(status);
  expect(((await res.json()) as { message: string }).message).toBe(message);
}

test.describe.serial("Manual routing: Reassign and Refer", () => {
  test.skip(!fixtures, "needs the fixtures e2e/global-setup.ts inserts");

  test("Focal reassigns a Reported ticket from Focal Intake: the reason is required and the move is recorded", async ({ page, browser }) => {
    const { ticketId, reportId } = fixtures!.focalReported;
    await loginAdmin(page, E2E_FOCAL_ADMIN);
    await page.goto(`/admin/focal/intake/${reportId}`);
    const reassign = page.getByRole("button", { name: "Reassign", exact: true });
    await settleAdminPage(page, reassign);
    await expect(page.getByRole("button", { name: "Forward", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Escalate", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refer", exact: true })).toBeEnabled();

    await reassign.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("combobox", { name: "Reassign to" })).toHaveText("MDRRMO");
    await dialog.getByRole("button", { name: "Reassign to MDRRMO" }).click();
    await expect(dialog.getByText("A reason is required.", { exact: true })).toBeVisible();

    await dialog.getByLabel("Reason (required)").fill("E2E: flooding belongs to MDRRMO.");
    const posted = page.waitForResponse(
      (r) => r.url().includes(`/api/admin/intake/${reportId}/reassign`) && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Reassign to MDRRMO" }).click();
    expect((await posted).ok()).toBe(true);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(/routed to MDRRMO/)).toBeVisible();

    // The new responsible office sees the Reassign, with its reason, on the
    // ticket's timeline.
    const mdrrmoContext = await browser.newContext();
    const mdrrmoPage = await mdrrmoContext.newPage();
    await loginAdmin(mdrrmoPage, E2E_MDRRMO_ADMIN);
    await mdrrmoPage.goto(`/admin/tickets/${ticketId}`);
    const timelineTab = mdrrmoPage.getByRole("tab", { name: "Timeline" });
    await settleAdminPage(mdrrmoPage, timelineTab);
    await timelineTab.click();
    await expect(mdrrmoPage.getByText("Reassigned from MEO to MDRRMO. Reason: E2E: flooding belongs to MDRRMO.")).toBeVisible();
    await mdrrmoContext.close();
  });

  test("Focal cannot reassign or refer once the ticket has left Reported or has an active Work Order", async ({ page }) => {
    const { focalUnderReview, focalWorkOrder } = fixtures!;
    await loginAdmin(page, E2E_FOCAL_ADMIN);

    for (const [fixture, message] of [
      [focalUnderReview, focalBlockedNotReported(focalUnderReview.ticketId, "Under Review")],
      [focalWorkOrder, focalBlockedByWorkOrder(focalWorkOrder.ticketId)],
    ] as const) {
      await page.goto(`/admin/focal/intake/${fixture.reportId}`);
      const reassign = page.getByRole("button", { name: "Reassign", exact: true });
      await settleAdminPage(page, reassign);
      await expect(reassign).toBeDisabled();
      await expect(page.getByRole("button", { name: "Refer", exact: true })).toBeDisabled();
      await expect(page.getByTestId("routing-blocked")).toHaveText(message);

      await expectRefusal(page, `/api/admin/intake/${fixture.reportId}/reassign`, { toOffice: "MDRRMO", reason: "E2E" }, 403, message);
      await expectRefusal(page, `/api/admin/intake/${fixture.reportId}/refer`, { agency: "DPWH", reason: "E2E" }, 403, message);
    }
  });

  test("Forward and Escalate are gone from the API", async ({ page }) => {
    const { reportId } = fixtures!.focalUnderReview;
    await loginAdmin(page, E2E_FOCAL_ADMIN);
    for (const action of ["forward", "escalate"]) {
      const res = await page.request.post(`/api/admin/intake/${reportId}/${action}`, {
        data: { toOffice: "MDRRMO", reason: "E2E" },
      });
      expect(res.status()).toBe(404);
    }
  });

  test("MEO refers a referral ticket with a required reason; a repeat to the same agency and a no-op Reassign are refused", async ({ page }) => {
    const { ticketId } = fixtures!.meoReferral;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    const refer = page.getByRole("button", { name: "Refer", exact: true });
    await settleAdminPage(page, refer);

    await refer.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Referral agency" }).click();
    await page.getByRole("option", { name: "MENRO", exact: true }).click();
    await dialog.getByRole("button", { name: "Record referral" }).click();
    await expect(dialog.getByText("A reason is required.", { exact: true })).toBeVisible();
    await dialog.getByLabel("Reason (required)").fill("E2E: the leak is on a riverbank easement.");
    await dialog.getByRole("button", { name: "Record referral" }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole("tab", { name: "Timeline" }).click();
    await expect(page.getByText("Referral recorded — MENRO: E2E: the leak is on a riverbank easement.")).toBeVisible();

    const base = `/api/admin/tickets/${ticketId}`;
    await expectRefusal(page, `${base}/refer`, { agency: "menro", reason: "E2E: again" }, 400, `Ticket #${ticketId} is already referred to MENRO.`);
    await expectRefusal(page, `${base}/reassign`, { toOffice: "MDRRMO", reason: "   " }, 400, "A reason is required.");
    await expectRefusal(page, `${base}/reassign`, { toOffice: "MEO", reason: "E2E" }, 400, `Ticket #${ticketId} is already assigned to MEO.`);
    await expectRefusal(
      page,
      `${base}/refer`,
      { agency: "MDRRMO", reason: "E2E" },
      400,
      "MDRRMO is a municipal office, not an external agency. Use Reassign to move the ticket between MEO and MDRRMO.",
    );
  });

  test("MEO reassigns the ticket to MDRRMO from Ticket Detail and is told it left the queue", async ({ page }) => {
    const { ticketId } = fixtures!.meoReferral;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    const reassign = page.getByRole("button", { name: "Reassign", exact: true });
    await settleAdminPage(page, reassign);

    await reassign.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason (required)").fill("E2E: the leak is undermining a slope; MDRRMO leads.");
    await dialog.getByRole("button", { name: "Reassign to MDRRMO" }).click();
    await expect(dialog.getByRole("heading", { name: `Ticket #${ticketId} reassigned to MDRRMO` })).toBeVisible();
    await dialog.getByRole("button", { name: "Back to ticket queue" }).click();
    await expect(page).toHaveURL(/\/admin\/tickets$/);

    // MEO no longer has the ticket.
    expect((await page.request.get(`/api/admin/tickets/${ticketId}`)).status()).toBe(403);
  });

  test("an active Work Order blocks the responsible office's Reassign and Refer", async ({ page }) => {
    const { ticketId } = fixtures!.meoWorkOrder;
    const message = `Ticket #${ticketId} has an active Work Order. Finish or cancel its Work Orders before reassigning or referring it.`;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    const reassign = page.getByRole("button", { name: "Reassign", exact: true });
    await settleAdminPage(page, reassign);
    await expect(reassign).toBeDisabled();
    await expect(page.getByTestId("reassign-blocked")).toHaveText(message);

    await expectRefusal(page, `/api/admin/tickets/${ticketId}/reassign`, { toOffice: "MDRRMO", reason: "E2E" }, 409, message);
    await expectRefusal(page, `/api/admin/tickets/${ticketId}/refer`, { agency: "DPWH", reason: "E2E" }, 409, message);
  });

  test("a Rejected ticket hides Reassign, New Work Order and Add Assessment, and refuses routing", async ({ page }) => {
    const { ticketId } = fixtures!.rejected;
    const message = `Ticket #${ticketId} is Rejected and can no longer be reassigned or referred.`;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    const blocked = page.getByTestId("reassign-blocked");
    await settleAdminPage(page, blocked);
    await expect(blocked).toHaveText(message);
    await expect(page.getByRole("button", { name: "Reassign", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New Work Order" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Assessment" })).toHaveCount(0);

    await expectRefusal(page, `/api/admin/tickets/${ticketId}/reassign`, { toOffice: "MDRRMO", reason: "E2E" }, 409, message);
  });

  test("the System Administrator cannot route at all", async ({ page }) => {
    const { focalReported, focalUnderReview } = fixtures!;
    await loginAdmin(page, E2E_SYSTEM_ADMIN);
    const ticketRes = await page.request.post(`/api/admin/tickets/${focalUnderReview.ticketId}/reassign`, {
      data: { toOffice: "MDRRMO", reason: "E2E" },
    });
    expect(ticketRes.status()).toBe(403);
    const intakeRes = await page.request.post(`/api/admin/intake/${focalReported.reportId}/refer`, {
      data: { agency: "DPWH", reason: "E2E" },
    });
    expect(intakeRes.status()).toBe(403);
  });
});
