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
  await page.goto("/admin/map?category=Pothole&urgency=High");
  await waitForMapReady(page);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Category", { exact: true })).toHaveText("Pothole");
  await expect(page.getByLabel("Urgency", { exact: true })).toHaveText("High");
});

test("changing a map filter updates the URL", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/map");
  await waitForMapReady(page);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Illegal Dumping" }).click();

  await expect(page).toHaveURL(/[?&]category=Illegal(%20|\+)Dumping/);
});

test("refreshing the map page preserves selected filters", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/map?category=Fallen%20Tree&status=Reported");
  await waitForMapReady(page);

  await page.reload();
  await waitForMapReady(page);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Category", { exact: true })).toHaveText("Fallen Tree");
  await expect(page.getByLabel("Status", { exact: true })).toHaveText("Reported");
});

test("clearing filters removes the query params from the URL", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin/map?category=Pothole&urgency=High");
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

test("system admin can filter the map by office via the query param", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/map?office=MDRRMO");
  await waitForMapReady(page);

  const officeGroup = page.getByRole("group", { name: "Office" });
  await expect(officeGroup.getByRole("button", { name: "MDRRMO" })).toHaveAttribute("aria-current", "true");
});

test("system admin switching the office control updates the URL", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin/map");
  await waitForMapReady(page);

  const officeGroup = page.getByRole("group", { name: "Office" });
  await officeGroup.getByRole("button", { name: "MEO" }).click();
  await expect(page).toHaveURL(/[?&]office=MEO/);
});

test("MDRRMO office admin sees their own fixed office badge on the map", async ({ page }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  await page.goto("/admin/map");
  await waitForMapReady(page);
  await expect(page.getByLabel("Office", { exact: true })).toHaveText("My Office: MDRRMO");
});

// --- Phase 2: office-specific Map Presets on the dashboard ---------------

test("MEO office admin sees only MEO-relevant map presets, no MDRRMO badge group", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin");
  const presets = page.getByRole("region", { name: "Map presets" });
  await expect(presets).toBeVisible();
  await expect(presets.getByRole("link", { name: "Drainage Issues" })).toBeVisible();
  await expect(presets.getByRole("link", { name: "Potholes & Road Damage" })).toBeVisible();
  await expect(presets.getByRole("link", { name: "Illegal Dumping" })).toBeVisible();
  await expect(presets.getByRole("link", { name: "High-Urgency Open Work" })).toBeVisible();
  await expect(presets.getByRole("link", { name: "Flooding Reports" })).toHaveCount(0);
  await expect(presets.getByText("MDRRMO", { exact: true })).toHaveCount(0);
});

test("MDRRMO office admin sees only MDRRMO-relevant map presets", async ({ page }) => {
  await loginAs(page, E2E_MDRRMO_ADMIN);
  await page.goto("/admin");
  const presets = page.getByRole("region", { name: "Map presets" });
  await expect(presets.getByRole("link", { name: "Flooding Reports" })).toBeVisible();
  await expect(presets.getByRole("link", { name: "Fallen Trees" })).toBeVisible();
  await expect(presets.getByRole("link", { name: "High-Urgency Reports" })).toBeVisible();
  await expect(presets.getByRole("link", { name: "Drainage Issues" })).toHaveCount(0);
  await expect(presets.getByRole("link", { name: "Illegal Dumping" })).toHaveCount(0);
});

test("system admin sees both offices' presets, each labeled by office", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin");
  const presets = page.getByRole("region", { name: "Map presets" });
  await expect(presets.getByText("MEO", { exact: true })).toBeVisible();
  await expect(presets.getByText("MDRRMO", { exact: true })).toBeVisible();
  await expect(presets.getByRole("link", { name: "Drainage Issues" })).toBeVisible();
  await expect(presets.getByRole("link", { name: "Flooding Reports" })).toBeVisible();
});

test("clicking a map preset navigates to /admin/map with real query params that the map actually applies", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin");
  const presets = page.getByRole("region", { name: "Map presets" });
  await presets.getByRole("link", { name: "Illegal Dumping" }).click();

  await expect(page).toHaveURL(/\/admin\/map\?category=Illegal(%20|\+)Dumping/);
  await waitForMapReady(page);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Category", { exact: true })).toHaveText("Illegal Dumping");
});

test("a system admin's office-specific preset carries an explicit office param, since their map defaults to city-wide", async ({ page }) => {
  await loginAs(page, E2E_SYSTEM_ADMIN);
  await page.goto("/admin");
  const presets = page.getByRole("region", { name: "Map presets" });
  await presets.getByRole("link", { name: "Flooding Reports" }).click();

  await expect(page).toHaveURL(/\/admin\/map\?.*office=MDRRMO/);
  await waitForMapReady(page);
  const officeGroup = page.getByRole("group", { name: "Office" });
  await expect(officeGroup.getByRole("button", { name: "MDRRMO" })).toHaveAttribute("aria-current", "true");
});

test("no fake sidebar item was added for map presets", async ({ page }) => {
  await loginAs(page, E2E_MEO_ADMIN);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Map Presets" })).toHaveCount(0);
  // Reports & Exports, Barangay Insights, and Notifications are separate,
  // real routes added since this count was fixed at 5 — all are counted here too.
  await expect(nav.getByRole("link")).toHaveCount(8);
});
