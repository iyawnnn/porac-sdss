import { expect, test, type Page } from "@playwright/test";
import { E2E_MDRRMO_ADMIN } from "./test-credentials";
import { loginAdmin, settleAdminPage } from "./helpers";

// DENR-MGB Hazard Information on Ticket Detail (manuscript pp. 71–72;
// manuscript revision Phase 4, step 4b). Posts no report and never clicks
// Retry: the tickets and their hazard_information rows come from
// api/scripts/seed/seed-e2e-grouping-fixtures.ts (e2e/global-setup.ts), so
// nothing here calls the live DENR-MGB service. Run the API with
// HAZARD_INFORMATION_LOOKUPS=disabled so opening the "Not yet checked"
// ticket starts no live lookup either (docs/testing.md).

test.setTimeout(60_000);

interface HazardFixtures {
  classifiedTicketId: number;
  noClassificationTicketId: number;
  unavailableTicketId: number;
  notCheckedTicketId: number;
  laharTicketId: number;
  notApplicableTicketId: number;
}

const fixtures: HazardFixtures | null = process.env.E2E_GROUPING_FIXTURES
  ? ((JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { hazard?: HazardFixtures }).hazard ?? null)
  : null;

const ADVISORY = "Advisory — DENR-MGB susceptibility, not a risk score";

async function openPanel(page: Page, ticketId: number) {
  await page.goto(`/admin/tickets/${ticketId}`);
  const panel = page.getByTestId("hazard-information");
  await settleAdminPage(page, panel);
  await expect(panel.getByTestId("hazard-information-advisory")).toHaveText(ADVISORY);
  return panel;
}

test.describe("Hazard Information panel (staff, advisory)", () => {
  test.skip(!fixtures, "needs the fixtures e2e/global-setup.ts inserts");

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page, E2E_MDRRMO_ADMIN);
  });

  test("CLASSIFIED shows the source code and wording with the checked time, and the earlier result collapsed", async ({ page }) => {
    const panel = await openPanel(page, fixtures!.classifiedTicketId);
    await expect(panel.getByTestId("hazard-information-source")).toHaveText("Flood · DENR-MGB Detailed Flood Susceptibility");
    await expect(panel.getByTestId("hazard-information-state")).toHaveText("MF — Moderate Susceptibility to Flooding");
    await expect(panel.getByTestId("hazard-information-checked")).toContainText("Checked ");
    await expect(panel.getByRole("button", { name: "Retry lookup" })).toHaveCount(0);
    // Never a score or a Low/High risk word of our own.
    await expect(panel).not.toContainText(/risk score:|priority/i);

    const history = panel.getByTestId("hazard-information-history");
    await expect(history.locator("summary")).toHaveText("Earlier results (1)");
    const row = history.getByTestId("hazard-information-history-row");
    await expect(row).toBeHidden();
    await history.locator("summary").click();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Flood: No DENR-MGB classification at this location");
    await expect(row).toContainText("replaced");
  });

  test("NO_CLASSIFICATION is worded as no classification, never Low or safe", async ({ page }) => {
    const panel = await openPanel(page, fixtures!.noClassificationTicketId);
    await expect(panel.getByTestId("hazard-information-source")).toHaveText(
      "Rain-induced landslide · DENR-MGB Detailed Rain-induced Landslide Susceptibility",
    );
    await expect(panel.getByTestId("hazard-information-state")).toHaveText("No DENR-MGB classification at this location");
    await expect(panel).not.toContainText(/\blow\b|\bsafe\b/i);
    await expect(panel.getByTestId("hazard-information-history")).toHaveCount(0);
  });

  test("TEMPORARILY_UNAVAILABLE shows the time, the reason and a Retry button (not clicked)", async ({ page }) => {
    const panel = await openPanel(page, fixtures!.unavailableTicketId);
    await expect(panel.getByTestId("hazard-information-state")).toHaveText("Temporarily unavailable");
    await expect(panel.getByTestId("hazard-information-checked")).toContainText("Last tried ");
    await expect(panel).toContainText("Reason: Timed out after 8 s");
    await expect(panel.getByRole("button", { name: "Retry lookup" })).toBeVisible();
  });

  test("an applicable ticket with no result shows Not yet checked", async ({ page }) => {
    const panel = await openPanel(page, fixtures!.notCheckedTicketId);
    await expect(panel.getByTestId("hazard-information-state")).toHaveText("Not yet checked");
    await expect(panel.getByRole("button", { name: "Retry lookup" })).toHaveCount(0);
  });

  test("Lahar has no automated classification; other categories are not applicable", async ({ page }) => {
    const lahar = await openPanel(page, fixtures!.laharTicketId);
    await expect(lahar.getByTestId("hazard-information-state")).toHaveText("No automated classification in this version");
    await expect(lahar.getByTestId("hazard-information-source")).toHaveCount(0);

    const other = await openPanel(page, fixtures!.notApplicableTicketId);
    await expect(other.getByTestId("hazard-information-state")).toHaveText("Not applicable");
  });
});
