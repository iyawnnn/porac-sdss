
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { E2E_CITIZEN_ACCOUNT, E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs, loginCitizen } from "./helpers";

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

// Manuscript revision Phase 1, step 6d (Appendix L, Citizen Web-GIS Map;
// Table 12): the public map is a privacy-limited view of other citizens'
// reports. Uses the seeded citizen account, so it creates no report and
// costs nothing against the hourly submission limit.
test("public map sends and shows only privacy-limited details", async ({ page }) => {
  await loginCitizen(page, E2E_CITIZEN_ACCOUNT);

  const res = await page.request.get("/api/public-map");
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { tickets: Record<string, unknown>[] };
  for (const ticket of body.tickets) {
    expect(ticket).not.toHaveProperty("title");
    expect(ticket).not.toHaveProperty("image_url");
    expect(ticket).not.toHaveProperty("description");
    const lat = ticket.lat as number;
    const lng = ticket.lng as number;
    expect(Math.round(lat * 1000) / 1000).toBe(lat);
    expect(Math.round(lng * 1000) / 1000).toBe(lng);
    expect(ticket).toHaveProperty("reported_at");
    expect(ticket).toHaveProperty("last_updated_at");
    expect(ticket).toHaveProperty("assigned_office");
  }
  test.skip(body.tickets.length === 0, "No active public tickets to open a popup for.");

  await page.goto("/map");
  await expect(page.getByText("Public Report Map", { exact: true })).toBeVisible();
  const markers = page.locator(".leaflet-marker-pane .leaflet-marker-icon");
  await expect(markers.first()).toBeVisible();

  // Never click under the title panel (it sits over the top-left of the map
  // and swallows the click) or under a Leaflet control. Pins carry no text;
  // clusters show their count. A bare pin is preferred; otherwise a cluster,
  // which zooms in — or, at the last zoom level, spiderfies into pins (pins
  // can share a point because coordinates are rounded to 3 decimals).
  type Box = { x: number; y: number; width: number; height: number };
  const intersects = (a: Box, b: Box) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const panelBox = await page.getByText("Public Report Map", { exact: true }).locator("..").boundingBox();
  expect(panelBox).not.toBeNull();
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const popup = page.locator(".leaflet-popup-content");

  for (let attempt = 0; attempt < 10 && !(await popup.isVisible()); attempt++) {
    const blockers: Box[] = [panelBox!];
    for (const control of await page.locator(".leaflet-control-container .leaflet-control").all()) {
      const box = await control.boundingBox();
      if (box) blockers.push(box);
    }

    let target: (typeof markers) | null = null;
    for (const marker of await markers.all()) {
      if (!(await marker.isVisible())) continue;
      const box = await marker.boundingBox();
      if (!box) continue;
      const inViewport = box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
      if (!inViewport || blockers.some((b) => intersects(box, b))) continue;
      if ((await marker.innerText()).trim() === "") {
        target = marker;
        break;
      }
      target ??= marker;
    }
    if (!target) break;
    await target.click();
    await page.waitForTimeout(600);
  }

  if (!(await popup.isVisible())) {
    throw new Error("No public-map popup opened after 10 marker/cluster clicks outside the title panel.");
  }
  await expect(popup).toBeVisible();
  await expect(popup.getByText("Approximate", { exact: true })).toBeVisible();
  await expect(popup.getByText("Handled by", { exact: true })).toBeVisible();
  await expect(popup.getByText("Public update", { exact: true })).toBeVisible();
  await expect(popup.getByText(/exact pins and internal records are not shown/)).toBeVisible();
  await expect(popup.locator("img")).toHaveCount(0);
});
