import { expect, test, type Page } from "@playwright/test";
import { E2E_CITIZEN_ACCOUNT, E2E_FOCAL_ADMIN, E2E_MDRRMO_ADMIN, E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin, loginCitizen, settleAdminPage } from "./helpers";

// Staff category and location correction (manuscript revision Phase 3, step
// 3e). Posts no report: the tickets come from api/scripts/seed/
// seed-e2e-grouping-fixtures.ts (its correction fixtures), which
// e2e/global-setup.ts runs and e2e/global-teardown.ts retires (a full run
// already posts 20 reports, the per-IP hourly limit; docs/testing.md).
// Serial, because the citizen test reads the first test's correction
// (--workers=1).

test.setTimeout(60_000);

interface FixtureTicket {
  ticketId: number;
  reportId: number;
}
interface CorrectionFixtures {
  withinOffice: FixtureTicket;
  toMdrrmo: FixtureTicket;
  blockedByWorkOrder: FixtureTicket;
  location: FixtureTicket & { fromBarangay: string; target: { name: string; lat: number; lng: number } };
  focalReported: FixtureTicket;
  focalUnderReview: FixtureTicket;
}

const fixtures: CorrectionFixtures | null = process.env.E2E_GROUPING_FIXTURES
  ? ((JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { corrections?: CorrectionFixtures }).corrections ?? null)
  : null;

const ORIGINAL = "Pothole / Road Surface Damage";
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function openCategoryDialog(page: Page, newCategory: string) {
  await page.getByRole("button", { name: "Correct category…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "New category" }).click();
  await page.getByRole("option", { name: newCategory, exact: true }).click();
  return dialog;
}

async function openTimeline(page: Page) {
  await page.getByRole("tab", { name: "Timeline" }).click();
}

test.describe.serial("Staff category and location correction", () => {
  test.skip(!fixtures, "needs the fixtures e2e/global-setup.ts inserts");

  test("MEO corrects the category within the office; the citizen's category stays visible and the timeline records it", async ({ page }) => {
    const { ticketId } = fixtures!.withinOffice;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    await settleAdminPage(page, page.getByRole("button", { name: "Correct category…" }));

    const dialog = await openCategoryDialog(page, "Uneven Sidewalk · MEO");
    await expect(dialog.getByText(/so the ticket moves from/)).toHaveCount(0);
    const confirm = dialog.getByRole("button", { name: "Correct category" });
    await expect(confirm).toBeDisabled(); // a reason is required
    await dialog.getByLabel("Reason (required)").fill("E2E: the photo shows the sidewalk.");
    // Clicking also proves the Ticket Detail map doesn't cover the dialog.
    await confirm.click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(`#${ticketId} · Uneven Sidewalk`);
    await expect(page.getByTestId("citizen-category")).toHaveText(`Citizen-reported category: ${ORIGINAL}`);
    await openTimeline(page);
    await expect(
      page.getByText(`Category corrected: ${ORIGINAL} → Uneven Sidewalk. Reason: E2E: the photo shows the sidewalk.`),
    ).toBeVisible();
  });

  test("the citizen's own report page shows the current category and \"You reported\"", async ({ page }) => {
    await loginCitizen(page, E2E_CITIZEN_ACCOUNT);
    await page.goto(`/dashboard/reports/${fixtures!.withinOffice.reportId}`);
    await expect(page.getByText(`You reported: ${ORIGINAL}`)).toBeVisible();
    await expect(page.getByText("Uneven Sidewalk").first()).toBeVisible();
  });

  test("MEO corrects to an MDRRMO category: the ticket moves, and MDRRMO sees the Reassign with the reason", async ({ page, browser }) => {
    const { ticketId } = fixtures!.toMdrrmo;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    await settleAdminPage(page, page.getByRole("button", { name: "Correct category…" }));

    const dialog = await openCategoryDialog(page, "Localized Flooding · MDRRMO");
    await expect(dialog).toContainText("MDRRMO handles this category, so the ticket moves from MEO to MDRRMO.");
    await dialog.getByLabel("Reason (required)").fill("E2E: standing water, not a pothole.");
    await dialog.getByRole("button", { name: "Correct category" }).click();
    await expect(dialog.getByRole("heading", { name: `Ticket #${ticketId} moved to MDRRMO` })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Back to ticket queue" })).toBeVisible();

    const context = await browser.newContext();
    const mdrrmo = await context.newPage();
    await loginAdmin(mdrrmo, E2E_MDRRMO_ADMIN);
    await mdrrmo.goto(`/admin/tickets/${ticketId}`);
    await settleAdminPage(mdrrmo, mdrrmo.getByRole("heading", { level: 1 }));
    await expect(mdrrmo.getByRole("heading", { level: 1 })).toContainText(`#${ticketId} · Localized Flooding`);
    await expect(mdrrmo.getByText(/· MDRRMO · Initially routed to MEO ·/)).toBeVisible();
    await openTimeline(mdrrmo);
    await expect(mdrrmo.getByText("Reassigned from MEO to MDRRMO. Reason: E2E: standing water, not a pothole.")).toBeVisible();
    await expect(mdrrmo.getByText(`Category corrected: ${ORIGINAL} → Localized Flooding. Reason: E2E: standing water, not a pothole.`)).toBeVisible();
    await context.close();
  });

  test("a category of the other office is refused while a Work Order is active, in the dialog and on the server", async ({ page }) => {
    const { ticketId } = fixtures!.blockedByWorkOrder;
    const message = `Ticket #${ticketId} has an active Work Order, and the new category belongs to the other office. Finish or cancel the Work Orders first.`;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    await settleAdminPage(page, page.getByRole("button", { name: "Correct category…" }));

    const dialog = await openCategoryDialog(page, "Localized Flooding · MDRRMO");
    await expect(dialog.getByRole("alert")).toHaveText(message);
    await dialog.getByLabel("Reason (required)").fill("E2E: stays blocked.");
    await expect(dialog.getByRole("button", { name: "Correct category" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    const res = await page.request.post(`/api/admin/ticket-corrections/${ticketId}/category`, {
      data: { category: "Localized Flooding", reason: "E2E: stays blocked." },
    });
    expect(res.status()).toBe(409);
    expect(((await res.json()) as { message: string }).message).toBe(message);
  });

  test("MEO corrects the location: the barangay follows the point, and the citizen pin stays shown", async ({ page }) => {
    const { ticketId, fromBarangay, target } = fixtures!.location;
    await loginAdmin(page, E2E_MEO_ADMIN);
    await page.goto(`/admin/tickets/${ticketId}`);
    const location = page.getByTestId("ticket-location");
    await settleAdminPage(page, location);
    await expect(location).toContainText(fromBarangay);
    await expect(page.getByTestId("citizen-pin")).toHaveCount(0);

    await page.getByRole("button", { name: "Correct location…" }).click();
    const dialog = page.getByRole("dialog");
    // Clicking the map sets a new point...
    await dialog.locator(".leaflet-container").click({ position: { x: 60, y: 60 } });
    await expect(dialog.getByLabel("Latitude")).not.toHaveValue("");
    await expect(dialog.getByTestId("correct-location-distance")).toContainText(/Moves the ticket about \d+ m\./);
    // ...and typing the coordinates sets it exactly.
    await dialog.getByLabel("Latitude").fill(String(target.lat));
    await dialog.getByLabel("Longitude").fill(String(target.lng));
    await dialog.getByLabel("Reason (required)").fill("E2E: the pin was in the wrong barangay.");
    await dialog.getByRole("button", { name: "Correct location" }).click();
    await expect(dialog).toHaveCount(0);

    await expect(location).toContainText(target.name);
    await expect(page.getByTestId("citizen-pin")).toContainText(/^Citizen pin: \d+\.\d{5}, \d+\.\d{5} · \d+ m from the ticket location$/);
    await openTimeline(page);
    await expect(page.getByText(new RegExp(`^Location corrected: ${escapeRegExp(fromBarangay)} \\(.+\\) → ${escapeRegExp(target.name)} \\(.+\\), \\d+ m away\\. Reason: E2E: the pin was in the wrong barangay\\.$`))).toBeVisible();
  });

  test("Focal corrects a Reported ticket from Focal Intake, but not an Under Review one", async ({ page }) => {
    const { focalReported, focalUnderReview } = fixtures!;
    await loginAdmin(page, E2E_FOCAL_ADMIN);
    await page.goto(`/admin/focal/intake/${focalReported.reportId}`);
    await settleAdminPage(page, page.getByRole("button", { name: "Correct category…" }));

    const dialog = await openCategoryDialog(page, "Streetlight Out · MEO");
    await dialog.getByLabel("Reason (required)").fill("E2E: it is a streetlight.");
    await dialog.getByRole("button", { name: "Correct category" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Streetlight Out");
    await expect(page.getByTestId("citizen-category")).toHaveText(`Citizen-reported category: ${ORIGINAL}`);

    await page.goto(`/admin/focal/intake/${focalUnderReview.reportId}`);
    const button = page.getByRole("button", { name: "Correct category…" });
    await settleAdminPage(page, button);
    await expect(button).toBeDisabled();
    await page.getByLabel(/^Correct category unavailable: /).hover();
    await expect(page.getByRole("tooltip")).toContainText(
      `Focal Personnel can only correct a ticket while it is still Reported; Ticket #${focalUnderReview.ticketId} is Under Review.`,
    );
  });
});
