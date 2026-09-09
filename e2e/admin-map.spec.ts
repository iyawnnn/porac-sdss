import { expect, test } from "@playwright/test";
import { E2E_MEO_ADMIN, E2E_MDRRMO_ADMIN, E2E_SYSTEM_ADMIN } from "./test-credentials";
import { loginAdmin as loginAs } from "./helpers";

test.setTimeout(60_000);

async function waitForMapReady(page: import("@playwright/test").Page) {
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.getByText("Loading tickets...")).toHaveCount(0);
}

test("map loads with query params applied and reflects them in the filter bar", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/map?category=Pothole%20%2F%20Road%20Surface%20Damage&urgency=High");
  await waitForMapReady(page);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Category", { exact: true })).toHaveText("Pothole / Road Surface Damage");
  await expect(page.getByLabel("Urgency", { exact: true })).toHaveText("High");
});

test("changing a map filter updates the URL", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/map");
  await waitForMapReady(page);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Illegal Dumping Affecting Drainage or Road" }).click();

  await expect(page).toHaveURL(/[?&]category=Illegal(%20|\+)Dumping/);
});

test("refreshing the map page preserves selected filters", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/map?category=Fallen%20Tree%20%2F%20Storm-Related%20Obstruction&status=Reported");
  await waitForMapReady(page);

  await page.reload();
  await waitForMapReady(page);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Category", { exact: true })).toHaveText("Fallen Tree / Storm-Related Obstruction");
  await expect(page.getByLabel("Status", { exact: true })).toHaveText("Reported");
});

test("clearing filters removes the query params from the URL", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/map?category=Pothole%20%2F%20Road%20Surface%20Damage&urgency=High");
  await waitForMapReady(page);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("button", { name: "Reset filters" }).click();

  await expect(page).toHaveURL(/\/admin\/map$/);
});

test("invalid query params fail safely instead of crashing or matching nothing silently", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const response = await page.goto("/admin/map?category=NotARealCategory&urgency=Extreme&status=Bogus&layer=explode");
  expect(response?.status()).toBe(200);
  await waitForMapReady(page);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Category", { exact: true })).toHaveText("All categories");
  await expect(page.getByLabel("Urgency", { exact: true })).toHaveText("All urgency");
  await expect(page.getByLabel("Status", { exact: true })).toHaveText("All statuses");
});

test("MEO office admin cannot use a doctored ?office= param to view another office's markers", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);

  let geoResponseOffice: string | null = null;
  page.on("response", (res) => {
    if (res.url().includes("/api/admin/tickets/geo")) geoResponseOffice = new URL(res.url()).searchParams.get("office");
  });

  await page.goto("/admin/map?office=MDRRMO");
  await waitForMapReady(page);

  // The client only ever sends the doctored param through — the fixed
  // office Badge (not an interactive toggle) proves the UI itself never
  // adopted MDRRMO, and the server-side TicketsController.geo endpoint
  // re-derives office from the session regardless of what's requested.
  await expect(page.getByLabel("Office", { exact: true })).toHaveText("My Office: MEO");
  await expect(page.getByRole("group", { name: "Office" })).toHaveCount(0);
  expect(geoResponseOffice).toBe("MEO");
});

test("the real security boundary is the API, not the UI: a hand-crafted request with ?office=MDRRMO from an MEO session never returns MDRRMO markers", async ({ page, request }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  const cookies = await page.context().cookies();
  const cookie = cookies.find((c) => c.name === "ac_admin_session");
  const headers: Record<string, string> = cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {};

  const res = await request.get("/api/admin/tickets/geo?office=MDRRMO", { headers });
  expect(res.ok()).toBe(true);
  const tickets = (await res.json()) as { assigned_office: string }[];
  expect(tickets.every((t) => t.assigned_office === "MEO")).toBe(true);
});

// Batch 6 (five-role E2E reconciliation): these two tests used to exercise
// the map's office picker/filter as system_admin — a control that only
// ever rendered for system_admin's city-wide map view. Batch 1 of the
// five-role architecture removed system_admin's operational Map access
// entirely on the backend (OperationalStaffGuard denies GET
// /admin/tickets/geo), but this batch found the frontend page itself had
// NOT been updated to match: app/admin/map/page.tsx makes no server-side
// API call of its own (unlike every sibling operational page), so it kept
// rendering the full interactive map shell — including a still-clickable
// Office picker — with only a small inline "Tickets Unavailable" banner
// where pins would be. No data actually leaked (the API stayed guarded),
// but the page presented an operational surface to a denied role. Fixed
// in app/admin/map/page.tsx (an explicit system_admin denial, matching the
// AdminErrorCard pattern Work Orders/Ticket Queue/Reports already use) —
// this test pins that fix.
test("system admin cannot reach the Interactive Map at all", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/map?office=MDRRMO");
  await expect(page.getByText("Interactive Map Unavailable")).toBeVisible();
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Office" })).toHaveCount(0);
});

test("MDRRMO office admin sees their own fixed office badge on the map", async ({ page }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  await page.goto("/admin/map");
  await waitForMapReady(page);
  await expect(page.getByLabel("Office", { exact: true })).toHaveText("My Office: MDRRMO");
});

// Map Presets link-text/href/navigation coverage was removed here — Map
// Presets no longer renders anywhere in the product (Phase 3 correction:
// cut from the dashboard-landing composition, no other route currently
// renders it). See e2e/admin-dashboard.spec.ts's "legacy dashboard sections
// no longer render on /admin" for the replacement negative-assertion
// coverage. The sidebar-integrity guard below is unrelated to Map Presets'
// own visibility and stays.

test("no fake sidebar item was added for map presets", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Map Presets" })).toHaveCount(0);
  // Reports & Exports, Barangay Insights, and Notifications are separate,
  // real routes added since this count was fixed at 5 — all are counted here too.
  await expect(nav.getByRole("link")).toHaveCount(8);
});
