
import { expect, test, type Page } from "@playwright/test";
import { E2E_CITIZEN_ACCOUNT, E2E_MEO_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs, loginCitizen } from "./helpers";

test.setTimeout(60_000);

// The public map row since manuscript revision Phase 6, step 6a (handoff
// Decision 8): category, status, barangay, rounded pin and reported date,
// under an opaque per-response position key. own_report_id is set only on
// the signed-in citizen's own tickets.
const PUBLIC_MAP_ROW_KEYS = ["barangay_name", "category", "key", "lat", "lng", "own_report_id", "reported_at", "status"];

interface PublicMapRow {
  key: string;
  status: string;
  own_report_id: number | null;
  [field: string]: unknown;
}

// citizen1's public-map lifecycle fixture (Phase 6, step 6a): a Reported MEO
// Pothole ticket with one citizen1 report, inserted by
// api/scripts/seed/seed-e2e-grouping-fixtures.ts — no report is posted
// (docs/testing.md §6). A missing fixture fails the test.
function lifecycleFixture(): { ticketId: number; reportId: number } {
  const parsed = process.env.E2E_GROUPING_FIXTURES
    ? (JSON.parse(process.env.E2E_GROUPING_FIXTURES) as { citizen?: { publicMapLifecycle?: { ticketId: number; reportId: number } } })
        .citizen?.publicMapLifecycle
    : undefined;
  if (!parsed) throw new Error("Missing the citizen fixtures e2e/global-setup.ts inserts (E2E_GROUPING_FIXTURES.citizen).");
  return parsed;
}

async function publicMapRows(citizenPage: Page): Promise<PublicMapRow[]> {
  const res = await citizenPage.request.get("/api/public-map");
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { tickets: PublicMapRow[] }).tickets;
}

// The response carries no ticket id, so the reporter finds their own ticket
// by its own_report_id — which is also what proves own_report_id is set on
// their own tickets.
async function ownTicketStatus(citizenPage: Page, reportId: number): Promise<string | undefined> {
  return (await publicMapRows(citizenPage)).find((t) => t.own_report_id === reportId)?.status;
}

// Phase 6 regression coverage for Phase 5's fix (public hazard map active-
// status query previously omitted 'Under Review'). One fixture ticket is
// carried through Reported -> Under Review -> In Progress -> Rejected, with
// the public map re-checked after each transition.
test("public hazard map includes a ticket through Reported/Under Review/In Progress and excludes it once Rejected (terminal)", async ({ page, browser }) => {
  const { ticketId, reportId } = lifecycleFixture();
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await loginCitizen(citizenPage, E2E_CITIZEN_ACCOUNT);

  await expect.poll(() => ownTicketStatus(citizenPage, reportId)).toBe("Reported");

  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto(`/admin/tickets/${ticketId}`);
  await page.getByRole("button", { name: "Advance to Under Review" }).click();
  await expect(page.getByRole("button", { name: "Advance to In Progress" })).toBeVisible();

  await expect.poll(() => ownTicketStatus(citizenPage, reportId)).toBe("Under Review");

  await page.getByRole("button", { name: "Advance to In Progress" }).click();
  await expect(page.getByRole("button", { name: "Advance to Resolved" })).toBeVisible();

  await expect.poll(() => ownTicketStatus(citizenPage, reportId)).toBe("In Progress");

  await page.getByLabel("Rejection reason", { exact: true }).fill("Duplicate of an existing repair order.");
  await page.getByRole("button", { name: "Reject Ticket" }).click();
  await expect(page.getByText("This ticket was rejected.", { exact: true })).toBeVisible();

  // Terminal — excluded from the active public map entirely (undefined:
  // not present in the tickets array at all, not merely a different status).
  await expect.poll(() => ownTicketStatus(citizenPage, reportId)).toBeUndefined();

  await citizenContext.close();
});

// Appendix L (Citizen Web-GIS Map), Table 12 and handoff Decision 8: the
// public map is a privacy-limited view of other citizens' reports. Uses the
// seeded citizen account, so it creates no report.
test("public map sends and shows only privacy-limited details", async ({ page }) => {
  await loginCitizen(page, E2E_CITIZEN_ACCOUNT);

  const rows = await publicMapRows(page);
  const ownReportIds = new Set(
    ((await (await page.request.get("/api/reports/mine")).json()) as { id: number }[]).map((r) => r.id),
  );
  rows.forEach((ticket, index) => {
    // Exactly the public fields: no id, ticket number, tracking reference,
    // title, photo, description, reporter, last update or office.
    expect(Object.keys(ticket).sort()).toEqual(PUBLIC_MAP_ROW_KEYS);
    // Opaque per-response position keys, in order.
    expect(ticket.key).toBe(`p${index + 1}`);
    const lat = ticket.lat as number;
    const lng = ticket.lng as number;
    expect(Math.round(lat * 1000) / 1000).toBe(lat);
    expect(Math.round(lng * 1000) / 1000).toBe(lng);
    expect(["Reported", "Under Review", "In Progress"]).toContain(ticket.status);
    // own_report_id is only ever one of this citizen's own report ids.
    if (ticket.own_report_id !== null) expect(ownReportIds.has(ticket.own_report_id)).toBe(true);
  });
  const serialized = JSON.stringify(rows);
  expect(serialized).not.toMatch(/PRC-\d{4}-\d+/);
  expect(serialized).not.toMatch(/last_updated_at|assigned_office|tracking_reference|"id"|ticket_id|title|image_url|description/);
  test.skip(rows.length === 0, "No active public tickets to open a popup for.");

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
  // The field labels (the status pill can also read "Reported").
  await expect(popup.locator("dt")).toHaveText(["Barangay", "Location", "Reported"]);
  await expect(popup.getByText("Public update", { exact: true })).toBeVisible();
  await expect(popup.getByText(/exact pins and internal records are not shown/)).toBeVisible();
  // Dropped in step 6a: no last update, no handling office, no ticket number
  // (the dt list above is already exact; these name the removed ones).
  await expect(popup.getByText("Last update", { exact: true })).toHaveCount(0);
  await expect(popup.getByText("Handled by", { exact: true })).toHaveCount(0);
  const popupText = await popup.innerText();
  expect(popupText).not.toMatch(/#\d+|Ticket\s*#?\d+|PRC-\d{4}-\d+/);
  expect(popupText).not.toMatch(/\bMEO\b|\bMDRRMO\b/);
  await expect(popup.locator("img")).toHaveCount(0);
});
