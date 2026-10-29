import { expect, test } from "@playwright/test";
import { E2E_CITIZEN_ACCOUNT, E2E_FOCAL_ADMIN, E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin, loginCitizen, settleAdminPage } from "./helpers";

// Staff Merge / Remove / Regroup (manuscript revision Phase 3, step 3d).
// Posts no report: the tickets come from api/scripts/seed/
// seed-e2e-grouping-fixtures.ts, which e2e/global-setup.ts runs and
// e2e/global-teardown.ts retires (a full run already posts 20 reports, the
// per-IP hourly limit; docs/testing.md). Serial, because the citizen test
// reads the merge the first test makes (--workers=1).

test.setTimeout(60_000);

interface GroupingFixtures {
  merge: { olderTicketId: number; newerTicketId: number; newerReportId: number };
  remove: { ticketId: number; reportIds: [number, number] };
  regroup: { fromTicketId: number; toTicketId: number; reportIds: [number, number] };
  differentOffices: { meoTicketId: number; meoReportId: number; mdrrmoTicketId: number };
  workOrder: { viewedTicketId: number; ticketId: number };
}

const fixtures: GroupingFixtures | null = process.env.E2E_GROUPING_FIXTURES
  ? (JSON.parse(process.env.E2E_GROUPING_FIXTURES) as GroupingFixtures)
  : null;

test.describe.serial("Staff Merge / Remove / Regroup of related reports", () => {
  test.skip(!fixtures, "needs the fixtures e2e/global-setup.ts inserts");

  test("MEO merges a related ticket from the panel; the merged-away ticket is read-only with the banner, and the survivor lists it", async ({ page }) => {
    const { olderTicketId, newerTicketId } = fixtures!.merge;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${newerTicketId}`);
    const row = page.getByTestId(`related-ticket-${olderTicketId}`);
    await settleAdminPage(page, row);

    await row.getByRole("button", { name: "Merge…" }).click();
    const dialog = page.getByRole("dialog");
    // The survivor defaults to the older ticket.
    await expect(dialog.getByRole("radio", { name: new RegExp(`^Keep Ticket #${olderTicketId} \\(older\\)`) })).toBeChecked();
    await expect(dialog).toContainText(`1 report moves from Ticket #${newerTicketId} to Ticket #${olderTicketId}.`);
    const confirm = dialog.getByRole("button", { name: "Confirm merge" });
    await expect(confirm).toBeDisabled(); // a reason is required
    await dialog.getByLabel("Reason (required)").fill("E2E: the same pothole, reported twice.");
    // Clicking also proves the Ticket Detail map doesn't cover the dialog.
    await confirm.click();
    await expect(dialog).toHaveCount(0);

    const banner = page.getByTestId("merged-into-banner");
    await expect(banner).toContainText(`Merged into Ticket #${olderTicketId} on `);
    await expect(banner).toContainText("by MEO Supervisor. Reason: E2E: the same pothole, reported twice.");
    await expect(banner.getByRole("link", { name: `Ticket #${olderTicketId}`, exact: true })).toHaveAttribute(
      "href",
      `/admin/tickets/${olderTicketId}`,
    );
    // Read-only: no action buttons.
    await expect(page.getByText(`Read-only: merged into Ticket #${olderTicketId}.`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Advance to / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject Ticket" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Assessment$/ })).toHaveCount(0);
    await expect(page.getByText("Possibly related tickets", { exact: true })).toHaveCount(0);

    await page.goto(`/admin/tickets/${olderTicketId}`);
    const mergedFrom = page.getByTestId("merged-from");
    await settleAdminPage(page, mergedFrom);
    await expect(mergedFrom).toHaveText(`Includes reports merged from Ticket #${newerTicketId}`);
    await expect(page.getByText("Evidence & reports (2)", { exact: true })).toBeVisible();
    await expect(page.getByTestId("merged-into-banner")).toHaveCount(0);
  });

  test("citizen1's report page follows the merge and shows the survivor's status", async ({ page }) => {
    // The report was on a Reported ticket; the survivor is Under Review.
    await loginCitizen(page, E2E_CITIZEN_ACCOUNT);
    await page.goto(`/dashboard/reports/${fixtures!.merge.newerReportId}`);
    await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "Under Review");
  });

  test("MEO removes a report from a two-report ticket; it gets a ticket of its own, routed as a new report", async ({ page }) => {
    const { ticketId, reportIds } = fixtures!.remove;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    const card = page.getByTestId(`report-card-${reportIds[1]}`);
    await settleAdminPage(page, card);

    await card.getByRole("button", { name: "Remove from ticket…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason (required)").fill("E2E: a different pothole.");
    const response = page.waitForResponse((res) => res.url().endsWith("/api/admin/ticket-grouping/remove-report"));
    await dialog.getByRole("button", { name: "Remove report" }).click();
    const { newTicketId } = (await (await response).json()) as { newTicketId: number };
    await expect(dialog).toHaveCount(0);

    await expect(page.getByText("Evidence & reports (1)", { exact: true })).toBeVisible();
    await expect(page.getByTestId(`report-card-${reportIds[1]}`)).toHaveCount(0);
    // One report left: nothing to remove or move.
    await expect(page.getByRole("button", { name: "Remove from ticket…" })).toHaveCount(0);

    await page.goto(`/admin/tickets/${newTicketId}`);
    const moved = page.getByTestId(`report-card-${reportIds[1]}`);
    await settleAdminPage(page, moved);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`#${newTicketId} · Pothole / Road Surface Damage`);
    await expect(page.getByText(/· MEO · 1 report merged/)).toBeVisible();
  });

  test("MEO moves a report to a related ticket", async ({ page }) => {
    const { fromTicketId, toTicketId, reportIds } = fixtures!.regroup;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${fromTicketId}`);
    const card = page.getByTestId(`report-card-${reportIds[1]}`);
    await settleAdminPage(page, card);

    await card.getByRole("button", { name: "Move to another ticket…" }).click();
    const dialog = page.getByRole("dialog");
    // The only eligible related ticket is preselected.
    await expect(dialog.getByRole("radio", { name: new RegExp(`^Ticket #${toTicketId} · \\d+ m away`) })).toBeChecked();
    await dialog.getByLabel("Reason (required)").fill("E2E: belongs with the other report.");
    await dialog.getByRole("button", { name: "Move report" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Evidence & reports (1)", { exact: true })).toBeVisible();

    await page.goto(`/admin/tickets/${toTicketId}`);
    await settleAdminPage(page, page.getByTestId(`report-card-${reportIds[1]}`));
    await expect(page.getByText("Evidence & reports (2)", { exact: true })).toBeVisible();
    // The ticket severity follows the new membership (manuscript revision
    // Phase 4, step 4a): both fixture reports are Medium.
    await expect(page.getByTestId("ticket-severity-summary")).toHaveText("Ticket severity = median of 2 reports: Medium (0.500)");
    await expect(page.getByTestId(`ticket-severity-report-${reportIds[1]}`)).toContainText("Medium");
  });

  test("Focal sees why two tickets of different offices can't be merged", async ({ page }) => {
    const { meoReportId, mdrrmoTicketId } = fixtures!.differentOffices;
    await loginAdmin(page, E2E_FOCAL_ADMIN);
    await page.goto(`/admin/focal/intake/${meoReportId}`);
    const row = page.getByTestId(`related-ticket-${mdrrmoTicketId}`);
    await settleAdminPage(page, row);

    await expect(row.getByRole("button", { name: "Merge…" })).toBeDisabled();
    await row.getByLabel(/^Merge unavailable: /).hover();
    await expect(page.getByRole("tooltip")).toContainText("Reassign or Refer first so both tickets have the same office.");
  });

  test("a ticket with an active Work Order can't be merged away, in the dialog and on the server", async ({ page }) => {
    const { viewedTicketId, ticketId } = fixtures!.workOrder;
    const message = `Ticket #${ticketId} has an active Work Order. Finish or cancel its Work Orders first.`;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${viewedTicketId}`);
    const row = page.getByTestId(`related-ticket-${ticketId}`);
    await settleAdminPage(page, row);

    await row.getByRole("button", { name: "Merge…" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { name: new RegExp(`^Keep Ticket #${viewedTicketId} \\(older\\)`) })).toBeChecked();
    await expect(dialog).toContainText(message);
    await dialog.getByLabel("Reason (required)").fill("E2E: stays blocked.");
    await expect(dialog.getByRole("button", { name: "Confirm merge" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    const res = await page.request.post("/api/admin/ticket-grouping/merge", {
      data: { survivorTicketId: viewedTicketId, mergedTicketId: ticketId, reason: "E2E: stays blocked." },
    });
    expect(res.status()).toBe(409);
    expect(((await res.json()) as { message: string }).message).toBe(message);
  });
});
