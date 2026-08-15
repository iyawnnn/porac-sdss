
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

// Same disposable-ticket approach as e2e/admin-tickets.spec.ts's
// createThrowawayReport — "Pothole / Road Surface Damage" always routes to
// MEO (api/src/common/utils/office.ts), so E2E_MEO_ADMIN can advance/reject
// it without any additional reassignment.
async function createThrowawayReport(citizenPage: Page, titleSuffix: string): Promise<{ reportId: number; ticketId: number }> {
  const jitter = () => (Math.random() - 0.5) * 0.01;
  const title = `E2E public-map ${titleSuffix}`;
  const res = await citizenPage.request.post("/api/reports", {
    multipart: {
      title,
      category: "Pothole / Road Surface Damage",
      citizen_severity: "Low",
      lat: String(15.0711 + jitter()),
      lng: String(120.5401 + jitter()),
      image: {
        name: "01_poblacion.jpg",
        mimeType: "image/jpeg",
        buffer: readFileSync("public/uploads/reports/01_poblacion.jpg"),
      },
    },
  });
  if (!res.ok()) {
    const bodyText = await res.text().catch((e) => `<failed to read body: ${e}>`);
    throw new Error(
      `createThrowawayReport: POST /api/reports failed for title "${title}" — status ${res.status()} ${res.statusText()}\nbody: ${bodyText}`,
    );
  }
  return (await res.json()) as { reportId: number; ticketId: number };
}

async function signupCitizen(page: Page, label: string): Promise<void> {
  const email = `e2e-map-${label}-${Date.now()}@porac.ph`;
  const password = "PoracDemo2026!";
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Map");
  await page.getByLabel("Last name").fill(label);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

async function publicMapStatuses(citizenPage: Page, ticketId: number): Promise<string | undefined> {
  const res = await citizenPage.request.get("/api/public-map");
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { tickets: { id: number; status: string }[] };
  return body.tickets.find((t) => t.id === ticketId)?.status;
}

// Phase 6 regression coverage for Phase 5's fix (public hazard map active-
// status query previously omitted 'Under Review'). One report is created and
// carried through Reported -> Under Review -> In Progress -> Rejected, with
// the public map re-checked after each transition — a single disposable
// fixture rather than five separate tickets, to stay well inside the
// 20/hour report-submission budget (see docs/testing.md §6).
test("public hazard map includes a ticket through Reported/Under Review/In Progress and excludes it once Rejected (terminal)", async ({ page, browser }) => {
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await signupCitizen(citizenPage, "lifecycle");
  const { ticketId } = await createThrowawayReport(citizenPage, `${Date.now()}`);

  await expect.poll(() => publicMapStatuses(citizenPage, ticketId)).toBe("Reported");

  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto(`/admin/tickets/${ticketId}`);
  await page.getByRole("button", { name: "Advance to Under Review" }).click();
  await expect(page.getByRole("button", { name: "Advance to In Progress" })).toBeVisible();

  await expect.poll(() => publicMapStatuses(citizenPage, ticketId)).toBe("Under Review");

  await page.getByRole("button", { name: "Advance to In Progress" }).click();
  await expect(page.getByRole("button", { name: "Advance to Resolved" })).toBeVisible();

  await expect.poll(() => publicMapStatuses(citizenPage, ticketId)).toBe("In Progress");

  await page.getByLabel("Rejection reason", { exact: true }).fill("Duplicate of an existing repair order.");
  await page.getByRole("button", { name: "Reject Ticket" }).click();
  await expect(page.getByText("This ticket was rejected.", { exact: true })).toBeVisible();

  // Terminal — excluded from the active public map entirely (undefined:
  // not present in the tickets array at all, not merely a different status).
  await expect.poll(() => publicMapStatuses(citizenPage, ticketId)).toBeUndefined();

  await citizenContext.close();
});
