import { expect, test, type Page } from "@playwright/test";
import { E2E_MDRRMO_ADMIN } from "./test-credentials";
import { loginAdmin, settleAdminPage } from "./helpers";

// Rainfall context on Ticket Detail (manuscript p. 72; manuscript revision
// Phase 4, step 4c). Posts no report and never clicks Refresh: the tickets
// and their rainfall_context rows come from
// api/scripts/seed/seed-e2e-grouping-fixtures.ts (e2e/global-setup.ts), so
// nothing here calls the live weather service. Run the API with
// RAINFALL_LOOKUPS=disabled so opening a ticket whose reading is missing or
// over 10 minutes old writes nothing either (docs/testing.md).

test.setTimeout(60_000);

interface RainfallFixtures {
  currentZeroTicketId: number;
  staleTicketId: number;
  unavailableTicketId: number;
  notFetchedTicketId: number;
  laharTicketId: number;
  notApplicableTicketId: number;
  closedTicketId: number;
}

const fixtures: RainfallFixtures | null = process.env.E2E_GROUPING_FIXTURES
  ? ((JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { rainfall?: RainfallFixtures }).rainfall ?? null)
  : null;

const ADVISORY = "Advisory — current rainfall, not a risk score";

async function openPanel(page: Page, ticketId: number) {
  await page.goto(`/admin/tickets/${ticketId}`);
  const panel = page.getByTestId("rainfall-context");
  await settleAdminPage(page, panel);
  await expect(panel.getByTestId("rainfall-context-advisory")).toHaveText(ADVISORY);
  return panel;
}

test.describe("Rainfall context panel (staff, advisory)", () => {
  test.skip(!fixtures, "needs the fixtures e2e/global-setup.ts inserts");

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page, E2E_MDRRMO_ADMIN);
  });

  test("CURRENT 0 mm shows 0 mm with the observation time and provider, and the earlier reading collapsed", async ({ page }) => {
    const panel = await openPanel(page, fixtures!.currentZeroTicketId);
    await expect(panel.getByTestId("rainfall-context-source")).toHaveText("Rainfall (last hour) · OpenWeatherMap");
    await expect(panel.getByTestId("rainfall-context-state")).toHaveText("0 mm");
    await expect(panel.getByTestId("rainfall-context-observed")).toContainText("Observed ");
    await expect(panel).not.toContainText("Unavailable");
    await expect(panel).not.toContainText("Could not refresh");
    await expect(panel.getByRole("button", { name: "Refresh" })).toBeVisible();
    // Never a score or a risk word of our own.
    await expect(panel).not.toContainText(/risk score:|priority/i);

    const history = panel.getByTestId("rainfall-context-history");
    await expect(history.locator("summary")).toHaveText("Earlier readings (1)");
    const row = history.getByTestId("rainfall-context-history-row");
    await expect(row).toBeHidden();
    await history.locator("summary").click();
    await expect(row).toBeVisible();
    await expect(row).toContainText("4.5 mm");
    await expect(row).toContainText("replaced");
  });

  test("STALE shows the last known value, its observation time and Could not refresh with the reason", async ({ page }) => {
    const panel = await openPanel(page, fixtures!.staleTicketId);
    await expect(panel.getByTestId("rainfall-context-state")).toHaveText("Last known: 3.2 mm");
    await expect(panel.getByTestId("rainfall-context-observed")).toContainText("Observed ");
    await expect(panel.getByTestId("rainfall-context-stale")).toHaveText("Could not refresh");
    await expect(panel).toContainText("Reason: Timed out after 5 s");
  });

  test("UNAVAILABLE shows Unavailable with the time and reason, never 0 mm", async ({ page }) => {
    const panel = await openPanel(page, fixtures!.unavailableTicketId);
    await expect(panel.getByTestId("rainfall-context-state")).toHaveText("Unavailable");
    await expect(panel.getByTestId("rainfall-context-observed")).toContainText("Last tried ");
    await expect(panel).toContainText("Reason: HTTP 503");
    await expect(panel).not.toContainText("0 mm");
    await expect(panel.getByRole("button", { name: "Refresh" })).toBeVisible();
  });

  test("an applicable ticket with no reading shows Not yet fetched", async ({ page }) => {
    const panel = await openPanel(page, fixtures!.notFetchedTicketId);
    await expect(panel.getByTestId("rainfall-context-state")).toHaveText("Not yet fetched");
    await expect(panel).not.toContainText(" mm");
  });

  test("a closed ticket shows its stored reading as historical, with no Refresh", async ({ page }) => {
    const panel = await openPanel(page, fixtures!.closedTicketId);
    await expect(panel.getByTestId("rainfall-context-historical")).toBeVisible();
    await expect(panel.getByTestId("rainfall-context-state")).toHaveText("12.5 mm");
    await expect(panel.getByRole("button", { name: "Refresh" })).toHaveCount(0);
  });

  test("Lahar and other categories are not applicable", async ({ page }) => {
    for (const ticketId of [fixtures!.laharTicketId, fixtures!.notApplicableTicketId]) {
      const panel = await openPanel(page, ticketId);
      await expect(panel.getByTestId("rainfall-context-state")).toHaveText("Not applicable");
      await expect(panel.getByTestId("rainfall-context-source")).toHaveCount(0);
      await expect(panel.getByRole("button", { name: "Refresh" })).toHaveCount(0);
    }
  });
});
